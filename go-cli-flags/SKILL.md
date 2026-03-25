---
name: go-cli-flags
description: CLI flag handling with flag.FlagSet. Use when writing command-line tools or parsing arguments.
---

## CLI Flags

Use `flag.FlagSet` (not global `flag`) for composability:

```go
fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
verbose := fs.Bool("verbose", false, "verbose output")
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

**Flag reservations:**
- `-h` → `--human-readable` (never `--help`)
- `-v` → `--verbose` (never `--version`)
- `-V`, `-version`, `--version`, `version` → print version and exit
- `help`, `-help`, `--help` → print version + blank line + usage, then exit