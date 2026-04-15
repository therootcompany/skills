---
name: golang-auth
description: golib auth modules (csvauth, envauth, jwt). Use when implementing HTTP authentication, API keys, or JWT handling.
---

## Auth module hierarchy

Each is a separate Go module with its own `go.mod`. Import by full path:

- `github.com/therootcompany/golib/auth` — `BasicRequestAuthenticator` extracts credentials from HTTP requests (Basic, Bearer, headers, query params)
- `github.com/therootcompany/golib/auth/envauth` — `BasicCredentials{Username, Password}` from environment for single-user auth
- `github.com/therootcompany/golib/auth/csvauth` — `Auth` loads credentials.tsv for multi-user, tokens, service accounts
- `github.com/therootcompany/golib/auth/jwt` — `Signer`, `Verifier`, `Validator` for JWT with JWKS endpoint

## Credentials (csvauth)

Multi-user credentials stored in TSV. Use for login, API tokens, and service accounts.

```go
import (
    "github.com/therootcompany/golib/auth"
    "github.com/therootcompany/golib/auth/csvauth"
)

a := csvauth.MustNewFromHex(os.Getenv("CSVAUTH_AES_128_KEY"))
a.LoadFile("users.tsv")

// Authenticate directly — use "" for username when only a token is provided.
p, err := a.Authenticate("", token)   // Bearer token or ?access_token=
p, err := a.Authenticate(user, pass)  // Basic auth
```

`p` is `auth.BasicPrinciple`; call `p.Permissions()` to get roles.

### Extracting credentials from a request

```go
func authenticateRequest(a *csvauth.Auth, r *http.Request) (auth.BasicPrinciple, error) {
    if token, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); found && token != "" {
        return a.Authenticate("", token)
    }
    if user, pass, ok := r.BasicAuth(); ok {
        return a.Authenticate(user, pass)
    }
    if token := r.URL.Query().Get("access_token"); token != "" {
        return a.Authenticate("", token)
    }
    return nil, csvauth.ErrNotFound
}
```

### Role checking

```go
if !slices.Contains(p.Permissions(), "admin") {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}
```

### Service account (outbound requests)

```go
account, _ := a.LoadServiceAccount("s3_files")
req.SetBasicAuth(account.Name, account.Secret())
```

CLI: `csvauth init`, `csvauth store`, `csvauth verify`.

## Single-user auth (envauth)

```go
import (
    "github.com/therootcompany/golib/auth"
    "github.com/therootcompany/golib/auth/envauth"
)

creds := &envauth.BasicCredentials{
    Username: os.Getenv("BASIC_AUTH_USERNAME"),
    Password: os.Getenv("BASIC_AUTH_PASSWORD"),
}
ra := auth.NewBasicRequestAuthenticator(creds)
```

## JWT

```go
import "github.com/therootcompany/golib/auth/jwt"

// Issue
pk, _ := jwt.NewPrivateKey()
signer, _ := jwt.NewSigner([]*jwt.PrivateKey{pk})
tokenStr, _ := signer.SignToString(&claims)

// Verify
verifier := signer.Verifier()
jws, _ := verifier.VerifyJWT(tokenStr)
jws.UnmarshalClaims(&claims)

// Validate — OIDC ID tokens from an IdP
validator := jwt.NewIDTokenValidator(issuers, audiences, nil)
validator.Validate(nil, &claims, time.Now())
```

### Session JWTs — set `auth_time`, don't skip it

`NewIDTokenValidator` requires `auth_time` by default (OIDC Core §2 —
"when the End-User authenticated"). For a session cookie minted after
an OIDC callback, `auth_time` and `iat` are **distinct**:

| Claim | Meaning | When it changes |
|---|---|---|
| `auth_time` | When the user actually authenticated (IdP callback time) | Only on a fresh login |
| `iat` | When this particular JWT was signed | Every re-issue / rotation |

Carry `auth_time` forward from the callback into every subsequent
session cookie for that login. This lets you:
- Enforce `max_age` — force re-auth after N seconds since last real login.
- Distinguish "cookie was rotated 5 minutes ago" from "user hasn't
  logged in for 30 days" — same `iat`, very different `auth_time`.
- Keep using `NewIDTokenValidator` unchanged.

```go
// At callback, right after VerifyIDToken succeeds:
session := SessionClaims{
    TenantID:   tenantID,
    IsOperator: isOperator,
}
session.Sub = identityID
session.AuthTime = time.Now().Unix() // or idToken.AuthTime if the IdP set one
// iat/exp filled in by signSession()
```

On session rotation (token refresh, role change, etc), mint a new
cookie but copy `auth_time` from the old one — the user hasn't
re-authenticated, only the cookie has.

## Application-level secret envelope (AES-256-GCM)

When you need secrets-at-rest without a KMS (self-hosted VMs, zero-ops
posture): store ciphertext in a DB column, keep the key in an env var.
The storage layer holds opaque `[]byte` — only the handler layer owns
the key.

Layout on disk: `[12-byte nonce][ciphertext][16-byte GCM tag]`.
`cipher.AEAD.Seal` produces exactly this when you pass the nonce as
the `dst` argument.

```go
func (s *Server) encryptSecret(plaintext []byte) ([]byte, error) {
    block, err := aes.NewCipher(s.key) // 32 bytes for AES-256
    if err != nil { return nil, err }
    aead, err := cipher.NewGCM(block)
    if err != nil { return nil, err }
    nonce := make([]byte, aead.NonceSize())
    if _, err := rand.Read(nonce); err != nil { return nil, err }
    return aead.Seal(nonce, nonce, plaintext, nil), nil
}

func (s *Server) decryptSecret(env []byte) ([]byte, error) {
    // ... mirror; returns a single sentinel error for any auth/parse
    // failure so clients can't distinguish "malformed" from "wrong key"
}
```

Rules:
- MUST: 32-byte key (AES-256). Hex-encoded in the env var is fine.
- MUST: Decrypt returns ONE sentinel error for all cipher failures —
  do not distinguish "too short" from "tag mismatch" (oracle).
- MUST: Zero the plaintext with `for i := range pt { pt[i] = 0 }`
  as soon as it's no longer needed. Go won't reuse the backing array
  but the next GC cycle might not run soon.
- NEVER: Store the key in the same row / file / backup as the
  ciphertext. Env var or KMS only.
- Key rotation: decrypt-with-old + re-encrypt-with-new sweep. Support
  two keys via a `[]byte` list if rotation is ongoing.

See `~/Agents/skills/go-develop/references/examples/` for full auth_example.go, envauth_example.go, jwt_example.go.