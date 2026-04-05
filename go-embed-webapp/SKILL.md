---
name: go-embed-webapp
description: Build single-binary Go web applications with embedded frontend assets. Use when creating or reviewing Go web apps that serve static content, SPAs, or hybrid API+frontend services. Covers embed.FS patterns, SPA routing, project structure, and common pitfalls. Triggers on "embed web app", "single binary web app", "Go embed frontend", "embedded static files", or when reviewing Go code with embed directives.
---

# Go Embedded Web Applications

Single-binary web apps: embed the frontend, serve it clean, keep it boring.

## Project Structure

```
myapp/
├── cmd/
│   └── server/
│       └── main.go        # Server entry point
├── internal/
│   └── api/               # API handlers (if needed)
├── web/
│   ├── dist/              # Built frontend (embedded)
│   └── src/               # Frontend source (not embedded)
└── embed.go               # Embed declarations
```

Keep embeds in one place. Don't scatter `//go:embed` across packages.

## Embed Pattern

Single source of truth in a dedicated file:

```go
// embed.go
package myapp

//go:embed web/dist/*
var webFS embed.FS
```

This pattern makes the embedded content discoverable and avoids hunting through codebases.

## SPA Routing

For single-page applications with client-side routing, implement a fallback handler:

```go
type spaHandler struct {
    fs http.FileSystem
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // Try exact path first
    f, err := h.fs.Open(strings.TrimPrefix(r.URL.Path, "/"))
    if err == nil {
        f.Close()
        http.FileServer(h.fs).ServeHTTP(w, r)
        return
    }
    // Fallback to index.html for client-side routing
    r.URL.Path = "/"
    http.FileServer(h.fs).ServeHTTP(w, r)
}
```

The `http.FileServer` handles MIME types, caching headers, and range requests. Don't reinvent it.

## API + Frontend Routing

Explicit routing keeps API and static content separate:

```go
func main() {
    mux := http.NewServeMux()

    // API routes
    mux.HandleFunc("/api/", apiHandler)

    // SPA frontend
    mux.Handle("/", &spaHandler{fs: http.FS(webFS)})

    http.ListenAndServe(":8080", mux)
}
```

No magic routing. One clear path for each request type.

## Development Mode

Production uses embedded files. Development serves from filesystem or proxies to a dev server:

```go
var webHandler http.Handler

if os.Getenv("GO_ENV") == "development" {
    // Serve from filesystem during development
    webHandler = http.FileServer(http.Dir("web/dist"))
} else {
    // Use embedded files in production
    webHandler = &spaHandler{fs: http.FS(webFS)}
}
```

This enables hot reload during development while keeping the single-binary production artifact.

## Cache Busting

Let the frontend build handle cache busting. If your build outputs `app.abc123.js`, the filename is the cache key. No need for version query strings or manual cache control.

## Minimal Working Example

The boring pattern is usually correct:

```go
//go:embed web/dist
var web embed.FS

func main() {
    http.Handle("/", http.FileServer(http.FS(web)))
    http.ListenAndServe(":8080", nil)
}
```

Three lines. Works for static sites. Add the SPA handler when you need client-side routing.

## Anti-Patterns

- **Embedding source files**: Embed `dist/` or build output, not `src/`. Source files shouldn't be in the binary.
- **Scattered embeds**: Multiple `//go:embed` directives across packages makes the embedded surface area hard to reason about.
- **Custom MIME sniffing**: `http.FileServer` already handles this correctly.
- **Templating from Go**: Let the frontend framework handle HTML. Go serves static files.
- **Path manipulation in handlers**: Use `http.FS` to wrap `embed.FS` — it normalizes paths correctly.

## Key Principles

1. **One embed file** — Single source of truth for what's in the binary
2. **Serve static files statically** — Don't process them through templates or handlers
3. **Explicit routing** — API on `/api/*`, everything else to frontend
4. **Dev mode is opt-in** — Production always uses embedded files
5. **Boring wins** — The standard library handles MIME, ranges, caching. Trust it.
