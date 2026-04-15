---
name: design-tsv-json-api-responses
description: Design and implement HTTP API endpoint responses that serve one payload as sectioned TSV (default), CSV, JSON, or Markdown via format negotiation. Use when designing a new API endpoint, deciding on response shape, or implementing Go handlers that return tabular data and must support agents (TSV), spreadsheets (CSV), structured clients (JSON), and humans (Markdown) from a single handler. Covers ?format= vs Accept-header precedence, Content-Type mapping, sectioned TSV with # comment headers, csvutil + csv.Writer patterns, dispatcher pattern, and format-aware error responses.
---

# TSV-First API Responses

Serve the same payload as **sectioned TSV (default)**, CSV, JSON, or Markdown from one handler. TSV is flat, streamable, and greppable — the right default for tabular data. Sections (`# name` comment lines) extend it to mixed-shape responses without losing that property.

## When to use which format as the default

| Default | Handler shape | Why |
|---|---|---|
| TSV | Lists, destructive-action previews, anything row-shaped | Streamable, greppable, tabs rarely in data |
| JSON | Genuinely nested responses (graphs, trees) | Sections don't help; use plain objects |
| CSV | `/api/sheets/*`-style spreadsheet interop | Same as TSV with comma delimiter |
| Markdown | Agent tool output meant to be rendered | `## section` + pipe tables |

Every handler declares ONE default, but MUST support all four via negotiation.

## Format negotiation

### Precedence (MUST)

1. `?format=` query param (if recognized)
2. `Accept` header (if recognized)
3. Handler default

Query param wins because clients often cannot control the `Accept` header (curl's `-sSL`, fetch defaults, link clicks).

### Mapping

| Format | `?format=` | Accept | Content-Type | Ext |
|---|---|---|---|---|
| TSV | `tsv` | `text/tab-separated-values` | `text/tab-separated-values; charset=utf-8` | `.tsv` |
| TSV (browser) | *(none)* | `text/html` | `text/plain; charset=utf-8` | `.tsv` |
| CSV | `csv` | `text/csv` | `text/csv; charset=utf-8` | `.csv` |
| JSON | `json` | `application/json` | `application/json; charset=utf-8` | `.json` |
| Markdown | `md` or `markdown` | `text/markdown` | `text/markdown; charset=utf-8` | `.md` |

`text/html` → `text/plain` (TSV body): browsers send `Accept: text/html,...` and refuse to render unknown content types, showing an error page instead. Returning `text/plain` with TSV content lets browsers display it as readable text. No `?format=html` — there is no HTML format; the plain-text fallback is not user-selectable.

### Helper

One helper used by every response writer. Return a `comma` rune as the dispatch tag:

```go
// responseFormat resolves ?format= then Accept to a (comma, content-type)
// pair. comma is 0 for JSON, '\t' for TSV, ',' for CSV, '|' for Markdown.
// '|' is a sentinel — Markdown does not actually use CSV encoding, but
// returning a rune keeps every writer on one switch.
func responseFormat(r *http.Request, defaultFmt string) (comma rune, contentType string) {
    f := r.URL.Query().Get("format")
    if f == "" {
        f = acceptToFormat(r.Header.Get("Accept"))
    }
    if f == "" {
        f = defaultFmt
    }
    switch f {
    case "json":
        return 0, "application/json; charset=utf-8"
    case "csv":
        return ',', "text/csv; charset=utf-8"
    case "md", "markdown":
        return '|', "text/markdown; charset=utf-8"
    default: // "tsv"
        // Check Accept for text/html — return text/plain so browsers render
        // the TSV as readable text instead of showing an error page.
        for _, part := range strings.Split(r.Header.Get("Accept"), ",") {
            if strings.TrimSpace(strings.SplitN(part, ";", 2)[0]) == "text/html" {
                return '\t', "text/plain; charset=utf-8"
            }
        }
        return '\t', "text/tab-separated-values; charset=utf-8"
    }
}
```

## Response envelopes

### JSON — wrapped

```json
{ "result": <payload>, "timings": [...] }                   // success
{ "error": "message", "details": [...], "timings": [...] }  // error
```

`details` and `timings` omitted when empty.

### TSV / CSV / Markdown — cannot wrap

Tabular formats can't carry sidecar metadata inline. Emit timings as a response header:

```
X-Timings: [{"label":"db:AccountList","count":1,"ms":3.2}, ...]
```

Same for `204 No Content`.

## List endpoints (flat rows)

Use `jszwec/csvutil` for struct-tag-driven row encoding so JSON and TSV stay in sync from one struct:

```go
type accountRow struct {
    Slug        string `json:"slug"        csv:"slug"`
    DisplayName string `json:"displayName" csv:"display_name"`
    Email       string `json:"email"       csv:"email"`
}

func writeRows[T any](w http.ResponseWriter, rows []T, comma rune, contentType string, tr *Tracker) {
    if b, err := json.Marshal(tr.Timings()); err == nil {
        w.Header().Set("X-Timings", string(b))
    }
    w.Header().Set("Content-Type", contentType)
    cw := csv.NewWriter(w)
    cw.Comma = comma
    enc := csvutil.NewEncoder(cw)
    _ = enc.Encode(rows)
    cw.Flush()
}
```

Design schemas so values never need quoting — no tabs or newlines in fields. For one-to-many, use comma-separated values within a field (`linux,darwin,windows`).

## Sectioned responses (mixed data)

When the response is not a single flat table — an action preview with `target`, `resources`, `restore`, `hint`, etc. — use `# section` comment lines to separate per-section flat tables:

```
# action
key	value
verb	delete bunch
dry_run	true

# target
key	value
slug	aj-dev
vmid	1108202

# resources
resource
proxmox pool aj-dev-dev
proxmox pool aj-dev-offline

# hint
text
Is this the right bunch? Re-run with ?confirm to proceed.
```

Rules:

- `# name\n` marks each section
- Blank line between sections
- Each section starts with a header row, then zero or more data rows
- **Empty sections are omitted entirely**
- Section order is fixed per response type — document it in the response type's godoc
- Two-column `key value` for simple maps, N-column for lists

Most TSV/CSV parsers treat `#` lines as comments, so a client that doesn't understand sections can still parse a single-section response as a normal TSV.

### Implementation

```go
type section struct {
    name   string
    header []string
    rows   [][]string
}

func writeSectioned(w http.ResponseWriter, comma rune, contentType string, tr *Tracker, sections []section) {
    if b, err := json.Marshal(tr.Timings()); err == nil {
        w.Header().Set("X-Timings", string(b))
    }
    w.Header().Set("Content-Type", contentType)

    bw := bufio.NewWriter(w)
    defer func() { _ = bw.Flush() }()

    first := true
    for _, s := range sections {
        if len(s.rows) == 0 {
            continue
        }
        if !first {
            fmt.Fprintln(bw)
        }
        first = false
        fmt.Fprintf(bw, "# %s\n", s.name)
        cw := csv.NewWriter(bw)
        cw.Comma = comma
        _ = cw.Write(s.header)
        for _, row := range s.rows {
            _ = cw.Write(row)
        }
        cw.Flush()
    }
}
```

### Markdown variant

Same shape: `## heading` + pipe table. Escape `|` in cell values as `\|`:

```markdown
## action

| key | value |
| --- | --- |
| verb | delete bunch |
| dry_run | true |

## target

| key | value |
| --- | --- |
| slug | aj-dev |
```

### JSON variant (not sectioned)

JSON clients expect nested objects, not reconstructed sections. Emit plain:

```json
{
  "dry_run": true,
  "action": "delete bunch",
  "target": {"slug": "aj-dev", "vmid": 1108202},
  "resources": ["proxmox pool aj-dev-dev", "proxmox pool aj-dev-offline"],
  "hint": "Is this the right bunch? Re-run with ?confirm to proceed."
}
```

## Dispatcher pattern

One entry point per response type, four writers (JSON handled separately, TSV and CSV share, Markdown separately):

```go
func writeActionResult(w http.ResponseWriter, r *http.Request, tr *Tracker, ar ActionResult) {
    comma, contentType := responseFormat(r, "tsv")
    switch comma {
    case 0:
        writeJSON(w, http.StatusOK, ar, tr)
    case '|':
        writeActionResultMarkdown(w, tr, ar)
    default: // '\t' or ','
        writeActionResultTSV(w, tr, ar, comma, contentType)
    }
}
```

## Format-aware errors (MUST)

Error responses MUST honor the same format negotiation. A client asking for TSV that gets a JSON error back can't parse the response.

Wire up one `writeError(w, r, ...)` dispatcher and use it from every handler. **Register a catch-all `mux.HandleFunc("/", notFoundHandler)`** so unknown paths don't fall back to the stdlib's `text/plain` "404 page not found".

### Simple errors (middleware, auth, single-condition)

Three-field vertical key-value — no sections needed:

```
field	value
error	missing_signature
description	No valid signature header was found.
hint	X-Hub-Signature-256 is required. `X-Hub-Signature-256: sha256=hex(hmac_sha256(secret, body))`
```

| field | role |
|---|---|
| `error` | machine code |
| `description` | what happened (static per code) |
| `hint` | instance detail + how to fix; backticks mark pseudocode |

MUST: Collapse `\n` in values to a single space for TSV/CSV — newlines break line-by-line parsing. Preserve `\n` in JSON (handled natively).

Markdown: emit a pipe table, not a list — consistent with tabular data, renders inline code in cells:

```markdown
| field | value |
| --- | --- |
| error | missing_signature |
| description | No valid signature header was found. |
| hint | X-Hub-Signature-256 is required. `X-Hub-Signature-256: sha256=hex(...)` |
```

### Complex errors (multi-condition, batch, API)

Use sectioned layout for multiple error records or structured detail:

```
# errors
code	description
404	no route registered for DELETE /api/bunches/test31

# details
text
pool aj-dev-dev does not exist
pool aj-dev-offline does not exist
```

## Content-Disposition

Set `inline; filename="..."` with the matching extension so curl, browsers, and agent tools can recognize the payload:

```go
ext := formatExt(contentType) // ".tsv" / ".csv" / ".json" / ".md"
w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"result%s\"", ext))
```

## Testing

- Unit-test each encoder with one canonical fixture per response type
- Assert exact wire bytes, including blank lines between sections and trailing newlines
- Test empty-section omission: a fixture with some empty sections must produce TSV without their headers
- Run the same fixture through all four formats in one test function — easiest way to notice drift

```go
func TestActionResultTSV_DryRun(t *testing.T) {
    ar := dryRunFixture()
    var buf bytes.Buffer
    writeActionResultTSV(&buf, newTracker(), ar, '\t', "text/tab-separated-values; charset=utf-8")
    got := buf.String()
    want := "# action\nkey\tvalue\nverb\tdelete bunch\ndry_run\ttrue\n\n# target\n..."
    if got != want {
        t.Errorf("mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
    }
}
```

## NEVER

- NEVER wrap TSV/CSV bodies in a JSON envelope — defeats streaming and greppability
- NEVER return `text/plain` or hand-rolled error bodies from handlers that otherwise negotiate — use the format-aware `writeError`
- NEVER put tabs or newlines in TSV field values — design the schema so they don't occur, or use CSV
- NEVER use `Accept` alone — `?format=` MUST take precedence
- NEVER reconstruct sections in JSON — emit plain nested objects for JSON clients

## Related

- `jszwec/csvutil` — struct-tag-driven TSV/CSV encoding
- `encoding/csv` stdlib — underlying writer; set `Comma` to `'\t'` for TSV
- `bnna-platform` `cmd/bnpd/response.go` + `docs/2026-04-09_delete-dry-run-default.md` — canonical implementation and wire-format spec
