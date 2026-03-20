---
name: go-develop
description: Go development conventions. Use when writing Go HTTP handlers, routes, middleware, migrations, or data endpoints.
---

## Stack

| Component | Library |
|-----------|---------|
| Go | 1.26+ |
| ENV | godotenv |
| HTTP | `net/http` mux, `r.PathValue()` |
| Middleware | `github.com/therootcompany/golib/http/middleware` |
| Database | `github.com/jackc/pgx/v5` |
| ORM | sqlc |
| Migrations | `github.com/therootcompany/golib/cmd/sql-migrate` |
| JWT | `github.com/therootcompany/golib/auth/jwt` |
| Data | `github.com/jszwec/csvutil` (TSV default) |

## Version features

| Feature | Use | Since |
|---------|-----|-------|
| HTTP routing | `mux.HandleFunc("GET /{id}", h)`, `r.PathValue("id")` | 1.22 |
| JSON omitzero | `json:"f,omitzero"` for T vs *T | 1.24 |
| Loop variables | Per-iteration scope (no `i := i`) | 1.22 |
| Iterators | `iter` package, `range` over func | 1.23 |
| Random | `math/rand/v2` | 1.22 |
| Null types | `database/sql.Null[T]` | 1.22 |
| Crypto CSPRNG | `crypto/*` uses internal CSPRNG | 1.26 |
| PBKDF2 | `crypto/pbkdf2` | 1.24 |

## API Router

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /api/items", handleListItems)
mux.HandleFunc("GET /api/items/{id}", handleGetItem)
mux.HandleFunc("POST /api/items", handleCreateItem)
```

## Middleware

```go
baseM := middleware.New(loggingMiddleware, realIPMiddleware)
authM := baseM.Add(jwtMiddleware)
adminM := authM.Add(requireAdminMiddleware)
mux.Handle("GET /api/items", authM.Then(handleListItems))
```

## Config

- No YAML unless required by a 3rd party tool
- POSIX .env for ENVs
- TSV for data exports
- Add bins to .gitignore

## TSV Endpoint Pattern

### 1. SQL query

```sql
-- name: ItemAll :many
SELECT id, name, created_at, updated_at
FROM items
WHERE sqlc.narg('since') IS NULL OR updated_at >= sqlc.narg('since')
ORDER BY updated_at ASC, id ASC;
```

### 2. Generate

```sh
sqlc generate
```

### 3. Handler

```go
func HandleItemsAllTSV(w http.ResponseWriter, r *http.Request) {
    since := parseOptionalTime(r.URL.Query().Get("since"))
    rows, err := queries.ItemAll(r.Context(), db.ItemAllParams{Since: since})
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "text/tab-separated-values; charset=utf-8")
    enc := csvutil.NewEncoder(w)
    enc.Delimiter = '\t'
    for _, row := range rows {
        enc.Encode(row)
    }
}
```

### 4. Register

```go
mux.Handle("GET /api/items.tsv", authM.Then(HandleItemsAllTSV))
mux.Handle("GET /api/items.json", authM.Then(HandleItemsAllJSON))
```

## Migrations

Use `github.com/therootcompany/golib/cmd/sql-migrate`. File naming: `YYYY-MM-DD-HHMMSS_description.up.sql` / `.down.sql`.

With `_migrations` tracking table:
- Up begins: `INSERT INTO _migrations (name, id) VALUES (...)`
- Down ends: `DELETE FROM _migrations WHERE id = '...'`
- Generate ID: `openssl rand -hex 4`

## JWT

### Issue

```go
pk, _ := jwk.NewPrivateKey()
signer, _ := jwt.NewSigner([]jwk.PrivateKey{*pk})
tokenStr, _ := signer.SignToString(&claims)
```

### Verify

```go
verifier := signer.Verifier()
jws, _ := verifier.VerifyJWT(tokenStr)
var claims AppClaims
jwt.UnmarshalClaims(jws, &claims)
```

### Claims

```go
type AppClaims struct {
    jwt.IDTokenClaims
    Roles []string `json:"roles"`
}
```

## Error Handling

### Sentinel errors

```go
var ErrNotFound = errors.New("not found")
```

### Wrapping order: less specific → more specific

```go
fmt.Errorf("%w: exp: token expired", ErrInvalidClaim)  // broad first
fmt.Errorf("header json: %w", err)                      // specific last
fmt.Errorf("payload base64: %w: %w", ErrInvalidPayload, err)  // Go 1.20+
```

### Multi-error

```go
errs = append(errs, fmt.Errorf("exp: %w", ErrMissingClaim))
return errors.Join(errs...)
```

## Testing

Prefer real code over mocks. Test actual behavior — real DB queries, real handler logic — not fakes that only verify wiring.

## Pre-commit

```sh
go fmt ./...
goimports -w .
go fix ./...
go test ./...
go vet ./...
```

## Go doc

```sh
go doc <package>
go doc <package>.<Symbol>
go doc -all <package>
```
