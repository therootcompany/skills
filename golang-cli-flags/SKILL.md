---
name: golang-cli-flags
description: CLI flag handling with flag.FlagSet. Use when writing command-line tools or parsing arguments.
---

## CLI Flags

- Use `flag.FlagSet` (not global `flag`) for composability:
- we use a config struct
- we don't use pointer returns

```go
type struct MainConfig {
    verbose bool
}
```

```go
cfg := MainConfig{}

fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
fs.BoolVar(&cfg.verbose, "verbose", false, "verbose output")
if err := fs.Parse(os.Args[1:]); err != nil {
    if errors.Is(err, flag.ErrHelp) { os.Exit(0) }
    os.Exit(1)
}
```

Handle `-V`/`--version` and `help` before `fs.Parse`:

```go
if len(os.Args) > 1 {
    switch os.Args[1] {
    case "-V", "-version", "--version", "version":
        printVersion(os.Stdout)
        os.Exit(0)
    case "help", "-help", "--help":
        printVersion(os.Stdout)
        fmt.Fprintln(os.Stdout, "")
        fs.SetOutput(os.Stdout)
        fs.Usage()
        os.Exit(0)
    }
}
```

## Secrets — never as a flag literal

CLI args are visible in `/proc/PID/cmdline` to every local user on the
host. Never accept a secret (API key, password, token, private key) as
the *value* of a flag. Accept secrets via **only** these channels, in
priority order:

1. **Environment variable** — `$SMTPD_API_KEY`, `$PG_PASSWORD`, etc.
2. **File path flag** — `--api-key-file /path/to/file`. Read the file,
   `bytes.TrimSpace` the contents (files often end in `\n`).
3. **Project default** — an env file (`operator.env`) or keychain lookup.

```go
var apiKeyFile string
fs.StringVar(&apiKeyFile, "api-key-file", "",
    "path to file containing the API key (or set $SMTPD_API_KEY)")

// after fs.Parse:
var apiKey string
if env := os.Getenv("SMTPD_API_KEY"); env != "" {
    apiKey = env
} else if apiKeyFile != "" {
    data, err := os.ReadFile(apiKeyFile)
    if err != nil { return fmt.Errorf("read -api-key-file: %w", err) }
    apiKey = string(bytes.TrimSpace(data))
}
```

Flag patterns to **avoid**:

- `-api-key <literal>` — visible in `ps`, shell history, logs.
- `-password <literal>`, `-token <literal>`, `-secret <literal>` — same.
- Interactive `-p` prompt as the *only* option — blocks automation;
  fine as an optional tty-only fallback but not the primary intake.

**Flag reservations:**

- `-h` → `--human-readable` (never `--help`)
- `-v` → `--verbose` (never `--version`)
- `-V`, `-version`, `--version`, `version` → print version and exit
- `help`, `-help`, `--help` → print version + blank line + usage, then exit

## Output format flag

Commands that produce structured output MUST offer `--format` with these values:

| Value    | Description                                  | When            |
|----------|----------------------------------------------|-----------------|
| `pretty` | Space-aligned columns, in-column wrapping    | TTY default     |
| `tsv`    | Tab-separated, one record per line           | Pipe default    |
| `csv`    | RFC 4180 with header row                     | `--format csv`  |
| `json`   | JSON array of objects                        | `--format json` |

Auto-detect when `--format` is empty or omitted: `pretty` on TTY, `tsv` when piped/redirected.

Use `golang.org/x/term` for TTY detection and terminal width:

```go
import "golang.org/x/term"

isTTY := term.IsTerminal(int(os.Stdout.Fd()))
width, _, _ := term.GetSize(int(os.Stdout.Fd()))
```

Pattern for the flag + validation:

```go
formatStr := fs.String("format", "", "output format: pretty, tsv, csv, json (default: auto)")

// after fs.Parse:
format, err := parseFormat(*formatStr)
```

Rules:
- `pretty` wraps long values in-column (never truncates)
- `tsv` and `csv` emit complete values, one record per line
- `json` uses `encoding/json` with 2-space indent
- `csv` includes a header row; `tsv` does not (convention: TSV is grep-friendly, CSV is spreadsheet-friendly)
- All formats emit the full value — never truncate

### Sections in TSV/CSV

When output has logical groups (e.g. per-domain records), use `#` comment lines
and blank lines as section separators. Parsers that skip `#` lines get clean data;
humans and `grep` get context:

```
# mail.example.com (zone: example.com)
mail.example.com	A	93.184.216.34
mail.example.com	MX	10 mx1.example.com.

# mail.other.co (zone: other.co)
mail.other.co	A	93.184.216.35
mail.other.co	MX	10 mx1.other.co.
```

For CSV, same convention — `#` comment rows are ignored by most parsers:

```
# mail.example.com (zone: example.com)
name,type,value
mail.example.com,A,93.184.216.34
```

For JSON, use top-level object with named keys instead of flat array when sections exist:

```json
{
  "mail.example.com": [ {"name": "...", "type": "A", "value": "..."} ],
  "mail.other.co": [ ... ]
}
```

### Status/check output as grid

For diagnostic or status-check output (health checks, doctor, audits), TSV/CSV
can represent hierarchical status as a grid. Use `status` and `detail` columns,
with indent in the `item` column to show nesting:

```
status	item	detail
!	Cluster health	action needed
✓	  Null zone	znull exists
✓	  Null vnet	vnull exists
✓	  Null subnet	10.254.0.0/16 exists
!	  Accounts	3 missing PBS assignment(s)
	    bnna	
	    paperos	
	    test31	
!	  Unmanaged pools	2
!	    pmx-dev	
!	    pmx-offline	
```

`pretty` renders this with aligned columns and tree-like indentation:

```
! Cluster health: action needed
  ✓ Null zone: znull exists
  ✓ Null vnet: vnull exists
  ✓ Null subnet: 10.254.0.0/16 exists
  ! Accounts: 3 missing PBS assignment(s)
      bnna
      paperos
      test31
  ! Unmanaged pools: 2
      ! pmx-dev
      ! pmx-offline
```

Status markers: `✓` pass, `!` warning/action needed, `✗` failure. The `pretty`
format folds `item: detail` into one line; TSV/CSV keep them as separate columns
for machine parsing.
