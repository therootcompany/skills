// check-dep-age checks Go module dependencies against proxy.golang.org and
// flags any that were published less than a threshold number of days ago.
//
// Usage:
//
//	go run check-dep-age.go [--days 30] [--dir path/to/module]
//
// Skips: stdlib extensions (golang.org/x/), trusted golib modules, and
// indirect dependencies.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type modInfo struct {
	Path      string
	Version   string
	Indirect  bool
	GoVersion string
	Main      bool
}

type proxyInfo struct {
	Version string    `json:"Version"`
	Time    time.Time `json:"Time"`
}

func main() {
	days := flag.Int("days", 30, "minimum age in days")
	dir := flag.String("dir", ".", "path to Go module directory")
	flag.Parse()

	if err := run(*days, *dir); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(2)
	}
}

func run(days int, dir string) error {
	threshold := time.Duration(days) * 24 * time.Hour
	now := time.Now()

	// Use `go list -m -json all` to get module info
	cmd := exec.Command("go", "list", "-m", "-json", "all")
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("go list -m -json all: %w", err)
	}

	// Parse the concatenated JSON objects
	dec := json.NewDecoder(strings.NewReader(string(out)))
	var mods []modInfo
	for {
		var m modInfo
		if err := dec.Decode(&m); err == io.EOF {
			break
		} else if err != nil {
			return fmt.Errorf("parse go list output: %w", err)
		}
		mods = append(mods, m)
	}

	fmt.Printf("# Checking dependency age (threshold: %d days)\n", days)
	fmt.Printf("# module dir: %s\n", dir)
	fmt.Printf("#\n")

	client := &http.Client{Timeout: 10 * time.Second}
	var failCount, okCount, skipCount, warnCount int

	for _, m := range mods {
		if m.Main || m.Version == "" {
			continue
		}

		// Skip indirect deps
		if m.Indirect {
			fmt.Printf("SKIP  %-50s %-20s (indirect)\n", m.Path, m.Version)
			skipCount++
			continue
		}

		// Skip stdlib extensions
		if strings.HasPrefix(m.Path, "golang.org/x/") {
			fmt.Printf("SKIP  %-50s %-20s (stdlib extension)\n", m.Path, m.Version)
			skipCount++
			continue
		}

		// Skip trusted golib modules
		if strings.HasPrefix(m.Path, "github.com/therootcompany/golib") {
			fmt.Printf("SKIP  %-50s %-20s (trusted: golib)\n", m.Path, m.Version)
			skipCount++
			continue
		}

		// Query proxy.golang.org
		pubTime, err := queryProxy(client, m.Path, m.Version)
		if err != nil {
			fmt.Printf("WARN  %-50s %-20s (proxy lookup failed: %v)\n", m.Path, m.Version, err)
			warnCount++
			continue
		}

		age := now.Sub(pubTime)
		ageDays := int(age.Hours() / 24)
		pubDate := pubTime.Format("2006-01-02")

		if age < threshold {
			fmt.Printf("FAIL  %-50s %-20s published %s (%d days ago)\n", m.Path, m.Version, pubDate, ageDays)
			failCount++
		} else {
			fmt.Printf("OK    %-50s %-20s published %s (%d days ago)\n", m.Path, m.Version, pubDate, ageDays)
			okCount++
		}
	}

	fmt.Printf("#\n")
	fmt.Printf("# Summary: %d ok, %d failed, %d skipped, %d warnings\n", okCount, failCount, skipCount, warnCount)

	if failCount > 0 {
		fmt.Printf("# RESULT: FAIL — %d dependencies younger than %d days\n", failCount, days)
		os.Exit(1)
	}
	fmt.Printf("# RESULT: PASS — all checked dependencies meet age threshold\n")
	return nil
}

// queryProxy fetches the publish timestamp for a module version from proxy.golang.org.
func queryProxy(client *http.Client, modPath, version string) (time.Time, error) {
	// URL-encode capital letters per Go module proxy convention
	var encoded strings.Builder
	for _, c := range modPath {
		if c >= 'A' && c <= 'Z' {
			encoded.WriteByte('!')
			encoded.WriteRune(c + ('a' - 'A'))
		} else {
			encoded.WriteRune(c)
		}
	}

	url := fmt.Sprintf("https://proxy.golang.org/%s/@v/%s.info", encoded.String(), version)
	resp, err := client.Get(url)
	if err != nil {
		return time.Time{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return time.Time{}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var info proxyInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return time.Time{}, fmt.Errorf("decode: %w", err)
	}
	return info.Time, nil
}
