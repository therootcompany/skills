//go:build ignore

package jwt_example

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/therootcompany/golib/auth/jwt"
	"github.com/therootcompany/golib/auth/jwt/keyfetch"
)

// Custom claims type - embed jwt.TokenClaims
type AppClaims struct {
	jwt.TokenClaims
	Roles []string `json:"roles"`
}

// Example: Issue a JWT
func ExampleIssue() (string, error) {
	// Generate a new Ed25519 key (recommended default)
	pk, err := jwt.NewPrivateKey()
	if err != nil {
		return "", err
	}

	// Create a signer (supports multiple keys for rotation)
	signer, err := jwt.NewSigner([]*jwt.PrivateKey{pk})
	if err != nil {
		return "", err
	}

	// Create claims
	claims := &AppClaims{
		TokenClaims: jwt.TokenClaims{
			Iss: "https://myapp.example.com",
			Sub: "user-123",
			Aud: jwt.Listish{"my-client-id"},
			Exp: time.Now().Add(time.Hour).Unix(),
			IAt: time.Now().Unix(),
		},
		Roles: []string{"admin", "editor"},
	}

	// Sign and return token string
	return signer.SignToString(claims)
}

// Example: Verify a JWT with local keys
func ExampleVerifyLocal(tokenStr string) (*AppClaims, error) {
	// In practice, get signer from app initialization
	pk, _ := jwt.NewPrivateKey()
	signer, _ := jwt.NewSigner([]*jwt.PrivateKey{pk})

	// Create verifier from signer's public keys
	verifier := signer.Verifier()

	// Verify and decode
	jws, err := verifier.VerifyJWT(tokenStr)
	if err != nil {
		return nil, err
	}

	var claims AppClaims
	if err := jws.UnmarshalClaims(&claims); err != nil {
		return nil, err
	}

	return &claims, nil
}

// Example: Verify a JWT with remote JWKS
func ExampleVerifyRemote(tokenStr string) (*AppClaims, error) {
	fetcher := &keyfetch.KeyFetcher{
		URL:      "https://issuer.example.com/.well-known/jwks.json",
		MaxAge:   time.Hour,
		StaleAge: 30 * time.Minute,
	}
	verifier, err := fetcher.Verifier()
	if err != nil {
		return nil, err
	}

	jws, err := verifier.VerifyJWT(tokenStr)
	if err != nil {
		return nil, err
	}

	var claims AppClaims
	if err := jws.UnmarshalClaims(&claims); err != nil {
		return nil, err
	}

	return &claims, nil
}

// Example: Validate claims (exp, iss, aud, etc.)
func ExampleValidate(claims *AppClaims) error {
	validator := jwt.NewIDTokenValidator(
		[]string{"https://issuer.example.com"}, // allowed issuers
		[]string{"my-client-id"},               // allowed audiences
		nil,                                     // authorized parties
	)
	return validator.Validate(nil, claims, time.Now())
}

// Example: JWKS endpoint handler
func ExampleJWKSEndpoint(signer *jwt.Signer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&jwt.WellKnownJWKs{Keys: signer.Keys})
	}
}