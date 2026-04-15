//go:build ignore

package auth_example

import (
	"net/http"
	"os"

	"github.com/therootcompany/golib/auth"
	"github.com/therootcompany/golib/auth/csvauth"
)

// Example: Using BasicRequestAuthenticator with csvauth
func ExampleCSVAuth() http.HandlerFunc {
	// Load credentials from TSV file
	f, err := os.Open("./credentials.tsv")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	// Initialize with AES key from ENV
	store := csvauth.MustNewFromHex(os.Getenv("CSVAUTH_AES_128_KEY"))
	if err := store.LoadCSV(csvauth.NewNamedReadCloser(f, "credentials.tsv"), '\t'); err != nil {
		panic(err)
	}

	// Create request authenticator with sane defaults
	ra := auth.NewBasicRequestAuthenticator(store)

	// Return handler
	return func(w http.ResponseWriter, r *http.Request) {
		credential, err := ra.Authenticate(r)
		if err != nil {
			w.Header().Set("WWW-Authenticate", ra.BasicRealm)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		// Use credential.ID() and credential.Permissions()
		_ = credential
	}
}

// Example: Manual credential lookup
func ExampleManualAuth(store *csvauth.Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Try Basic Auth first
		username, password, ok := r.BasicAuth()
		if ok {
			cred, err := store.Authenticate(username, password)
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			// Authorized
			_ = cred
			return
		}

		// Try Bearer token
		token := r.Header.Get("Authorization")
		if len(token) > 7 && token[:7] == "Bearer " {
			cred, err := store.Authenticate("", token[7:])
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			_ = cred
			return
		}

		// Try X-API-Key header
		apiKey := r.Header.Get("X-API-Key")
		if apiKey != "" {
			cred, err := store.Authenticate("", apiKey)
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			_ = cred
			return
		}

		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}
}

// Example: Load service account for external API
func ExampleServiceAccount(store *csvauth.Auth) {
	account, err := store.LoadServiceAccount("s3_files")
	if err != nil {
		panic(err)
	}

	// Use with HTTP client
	req, _ := http.NewRequest("GET", "https://storage.example.com/bucket", nil)
	req.SetBasicAuth(account.Name, account.Secret())
	// ...
}