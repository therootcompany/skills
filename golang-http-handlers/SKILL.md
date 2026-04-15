---
name: golang-http-handlers
description: HTTP routing and middleware patterns. Use when writing handlers, ServeMux routes, or middleware chains.
---

## Production-first

Build for production from the start. Error handling, logging, auth, graceful shutdown are part of initial implementation, not polish.

## API Router

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /api/items", handleListItems)
mux.HandleFunc("GET /api/items/{id}", handleGetItem)
mux.HandleFunc("POST /api/items", handleCreateItem)
```

### Enumerate methods — do NOT leave the method blank

MUST: Always prefix the pattern with the method (`GET /foo`, `POST /foo`).

A pattern without a method matches **every** method — including ones
you didn't intend to handle. `mux.HandleFunc("/api/items", h)` catches
GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS. You almost never want
that. Enumerate the verbs you actually accept:

```go
// ✓ One handler per (method, path) — the mux 405s everything else.
mux.HandleFunc("GET /api/items", handleList)
mux.HandleFunc("POST /api/items", handleCreate)
mux.HandleFunc("GET /api/items/{id}", handleGet)
mux.HandleFunc("PUT /api/items/{id}", handleUpdate)
mux.HandleFunc("DELETE /api/items/{id}", handleDelete)

// ✗ Silent over-match — also handles PATCH, OPTIONS, etc.
mux.HandleFunc("/api/items", handleEverything)
```

Same rule for overlapping paths — the root route and API routes coexist
fine as long as each carries its method:

```go
mux.HandleFunc("GET /{$}", handleRoot)       // exactly "/"
mux.HandleFunc("GET /api/items", handleList) // "/api/items" and below
mux.HandleFunc("POST /api/items", handleCreate)
```

The `{$}` sentinel anchors the pattern to the exact path. Without it,
`GET /` would be a catch-all prefix (matches every GET, losing to
anything more specific).

### Conflict precedence (Go 1.22+ ServeMux)

More specific wins. "Specific" = more literal segments, longer literal
prefix, fewer wildcards. When two patterns genuinely conflict (neither
is more specific), registration **panics at startup** — a good failure
mode, surfaces route bugs at boot instead of in prod.

Common traps:

```go
mux.HandleFunc("GET /api/{id}", handleByID)
mux.HandleFunc("GET /api/items", handleList) // ✓ literal beats wildcard

mux.HandleFunc("GET /files/{path...}", handleFiles) // wildcard + ...
mux.HandleFunc("GET /files/index.html", handleIdx)  // ✓ literal wins
```

## Middleware

`middleware.Middleware` is `func(http.HandlerFunc) http.HandlerFunc` — note `HandlerFunc`,
not `Handler`.

```go
// Wrap the mux; base middleware (logging, panic recovery) goes here.
pub := middleware.WithMux(mux, recoverPanics, logRequests)
pub.HandleFunc("GET /health", handleHealth)

// Layer additional middleware with .With().
adm := pub.With(requireAuth)
adm.HandleFunc("GET /api/data", getData)

// Further layers — compose at registration, not per-request.
adminM := adm.With(requireAdmin)
adminM.HandleFunc("POST /api/admin/thing", doAdminThing)
```

**Creating middleware:**

```go
func logRequests(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next(w, r)
        log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
    }
}
```

## Request context

MUST: Pass `r.Context()` into every downstream I/O call — DB queries,
outbound HTTP, file ops. When the client disconnects or the server
receives SIGTERM, the ctx cancels and the work unwinds cleanly.

```go
func handleGetItem(w http.ResponseWriter, r *http.Request) {
    row, err := store.GetItem(r.Context(), r.PathValue("id")) // ← r.Context()
    ...
}
```

Never call a store method with `context.Background()` from a handler.
That disconnects the request from cancellation and leaks work across
client hangups and shutdown. If a store method lacks a ctx parameter,
that's a bug in the store — fix the signature, don't paper over it.

## Error responses at the boundary

MUST: Handlers map sentinel errors to status + short client message.
NEVER return `err.Error()` verbatim — leaks file paths, SQL, internals.
NEVER put server config or library names in client-facing messages.

### Error shape

Three fields, distinct roles:

| field | role | example |
|---|---|---|
| `error` | machine code | `"missing_signature"` |
| `description` | what happened (static) | `"No valid signature header was found."` |
| `hint` | instance detail + how to fix | `"X-Hub-Signature-256 is required. ` X-Hub-Signature-256: sha256=hex(...)`` `"` |

Hint uses backticks to mark inline pseudocode/commands. No server internals (config knobs, library names, internal limits).

### Error codes drive messages centrally

One switch owns descriptions and hints. Call sites pass only variable detail:

```go
func (x *Thing) writeHTTPError(w http.ResponseWriter, r *http.Request, errCode, detail string) {
    var httpCode int
    var description, hint string
    switch errCode {
    case "not_found":
        httpCode, description = 404, "Resource not found."
        hint = detail // e.g. "id=abc123 does not exist"
    case "conflict":
        httpCode, description = 409, "Resource already exists."
        hint = detail
    default:
        httpCode, description = 500, "An unexpected error occurred."
    }
    // serialize with content negotiation (see design-tsv-json-api-responses)
}

// call site — only passes variable detail
x.writeHTTPError(w, r, "not_found", fmt.Sprintf("id=%s does not exist", id))
```

For structured errors, log full error server-side; return request ID to client:

```go
default:
    reqID := middleware.RequestID(r.Context())
    log.Printf("handler %s: req=%s: %v", r.URL.Path, reqID, err)
    x.writeHTTPError(w, r, "internal_error", "request_id="+reqID)
```

### Connection-aware delivery

MUST: Only write an error body if the client can still receive it.

`io.ReadAll` errors mean the connection is already broken — writing a response body fails silently. Set `WriteHeader` so logging middleware records the correct status, then return:

```go
body, err := io.ReadAll(r.Body)
if err != nil {
    w.WriteHeader(http.StatusBadRequest) // for loggers; client is gone
    return
}
```

Body-too-large is the exception: caught before the connection breaks, client is still there, response lands.

## Static file serving

### `http.FileServerFS` with an `embed.FS`

```go
//go:embed all:web
var webRoot embed.FS

sub, _ := fs.Sub(webRoot, "web") // strip the top-level dir
mux.Handle("GET /", http.FileServerFS(sub))
```

Use `http.StripPrefix` when the route prefix doesn't match the FS root:

```go
mux.Handle("GET /assets/", http.StripPrefix("/assets/",
    http.FileServerFS(sub)))
```

### Host-aware serving (multi-portal on one origin)

When one server hosts multiple web surfaces that share common assets
(e.g. tenant portal + operator portal, both using the same CSS/JS),
split the static tree into three filesystems:

```
web/
├── lib/        shared CSS, JS, fonts — cacheable across portals
├── tenant/     tenant-only HTML pages
└── operator/   operator-only HTML pages
```

Two routing rules, one composition primitive:

1. **Host-independent shared assets** — `GET /lib/*` serves directly
   from the lib FS. One browser cache entry across all portals on the
   origin, no per-request host lookup.
2. **Host-aware per-portal pages** — `GET /portal/*` dispatches to
   tenant or operator FS based on a request-bound host → tenant
   resolution.

Compose shared assets under each per-portal FS with a small overlay
so portal HTML can `<link href="/lib/css/portal.css">` and Just Work:

```go
// MountedFS overlays Mount under Prefix of Base. Mount wins on
// prefix collisions — a portal cannot shadow a shared asset by
// colliding with the prefix.
type MountedFS struct {
    Base   fs.FS
    Mount  fs.FS
    Prefix string // e.g. "lib/" — rooted, no leading slash, trailing slash
}

func (m *MountedFS) Open(name string) (fs.File, error) {
    if rest, ok := strings.CutPrefix(name, m.Prefix); ok {
        if rest == "" { rest = "." }
        return m.Mount.Open(rest)
    }
    return m.Base.Open(name)
}
```

### Separation-of-trees rules

- MUST: One `//go:embed` per tree, not one embed with sub-directories.
  Forces a compile error if a tree moves or disappears and keeps the
  blast radius of a "add file to shared/" mistake small.
- MUST: Mount wins on prefix collisions. An operator page adding its
  own `lib/evil.js` must NOT be able to shadow shared `/lib/`. Test
  this explicitly — it's a silent security property otherwise.
- MUST: Host → surface mapping comes from a middleware that binds the
  resolved surface on the request context (e.g. `hostTenantFromContext`).
  Never re-parse `r.Host` inside the handler.
- NEVER: Load CSS/JS/fonts from CDNs (unpkg, jsdelivr). Vendor into
  `web/lib/` — one origin, auditable, no runtime dependency.

## TSV Endpoint

```go
func HandleItemsAllTSV(w http.ResponseWriter, r *http.Request) {
    rows, err := queries.ItemAll(r.Context(), db.ItemAllParams{})
    if err != nil { http.Error(w, err.Error(), 500); return }
    w.Header().Set("Content-Type", "text/tab-separated-values; charset=utf-8")
    enc := csvutil.NewEncoder(w)
    enc.Delimiter = '\t'
    for _, row := range rows { enc.Encode(row) }
}
```

## Testing

Prefer real code over mocks. Test actual behavior — real DB queries, real handler logic — not fakes.