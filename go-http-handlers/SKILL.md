---
name: go-http-handlers
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