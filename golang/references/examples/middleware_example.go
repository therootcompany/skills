//go:build ignore

package middleware_example

import (
	"fmt"
	"net/http"
	"time"

	"github.com/therootcompany/golib/http/middleware/v2"
)

// Middleware is any function that wraps an http.Handler
type Middleware = middleware.Middleware

// Example: Panic recovery middleware
func recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				http.Error(w, fmt.Sprintf("Internal Server Error: %v", err), http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// Example: Request logging middleware
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		fmt.Printf("%s %s %v\n", r.Method, r.URL.Path, time.Since(start))
	})
}

// Example: Using WithMux to create a middleware chain
func Example() {
	mux := http.NewServeMux()

	// Wrap mux with base middleware
	mw := middleware.WithMux(mux, recoverPanics, logRequests)
	mw.HandleFunc("GET /api/version", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "1.0.0")
	})

	// Add more middleware for specific routes
	authMW := mw.With(requireAuth)
	authMW.HandleFunc("GET /api/user", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "user data")
	})
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth here
		next.ServeHTTP(w, r)
	})
}