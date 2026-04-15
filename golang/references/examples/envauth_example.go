//go:build ignore

package auth_example

import (
	"net/http"
	"os"

	"github.com/therootcompany/golib/auth"
	"github.com/therootcompany/golib/auth/envauth"
)

// Example: Single-user auth from environment variables
func ExampleEnvAuth() http.HandlerFunc {
	// Load single credential pair from ENV
	creds := &envauth.BasicCredentials{
		Username: os.Getenv("BASIC_AUTH_USERNAME"),
		Password: os.Getenv("BASIC_AUTH_PASSWORD"),
	}

	// Create request authenticator with defaults:
	// - Basic Auth enabled
	// - Authorization: Bearer/Token schemes
	// - X-API-Key header
	// - ?access_token= and ?token= query params
	ra := auth.NewBasicRequestAuthenticator(creds)

	return func(w http.ResponseWriter, r *http.Request) {
		_, err := ra.Authenticate(r)
		if err != nil {
			w.Header().Set("WWW-Authenticate", ra.BasicRealm)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		// Authorized - proceed with handler
	}
}

// Example: Customize request authenticator
func ExampleCustomAuth() http.HandlerFunc {
	creds := &envauth.BasicCredentials{
		Username: os.Getenv("BASIC_AUTH_USERNAME"),
		Password: os.Getenv("BASIC_AUTH_PASSWORD"),
	}

	ra := &auth.BasicRequestAuthenticator{
		Authenticator:        creds,
		BasicAuth:            true,
		BasicRealm:           "MyAPI",
		AuthorizationSchemes: []string{"Bearer"}, // only Bearer, not Token
		TokenHeaders:         []string{"X-API-Key"},
		TokenQueryParams:     nil, // disable query param auth
	}

	return func(w http.ResponseWriter, r *http.Request) {
		_, err := ra.Authenticate(r)
		if err != nil {
			w.Header().Set("WWW-Authenticate", ra.BasicRealm)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}
}