---
name: go-auth
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

// Validate
validator := jwt.NewIDTokenValidator(issuers, audiences, nil)
validator.Validate(nil, &claims, time.Now())
```

See `~/Agents/skills/go-develop/references/examples/` for full auth_example.go, envauth_example.go, jwt_example.go.