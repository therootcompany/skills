---
name: golang-import-sheet-data
description: Import Google Sheets as CSV, TSV, or ENV. Use when reading data from Google Sheets or converting spreadsheet data.
---

## Google Sheets to Data

```go
import "github.com/therootcompany/golib/io/transform/gsheet2csv"

r := gsheet2csv.NewReaderFromURL("https://docs.google.com/spreadsheets/d/XXX/edit")
records, _ := r.ReadAll()
fmt.Printf("DocID: %s, GID: %s\n", r.DocID, r.GID)
```

Parse any Google Sheet URL format:
- Edit URL: `https://docs.google.com/spreadsheets/d/{docid}/edit?gid={gid}`
- Share URL: `https://docs.google.com/spreadsheets/d/{docid}/edit?usp=sharing`
- Export URL: `https://docs.google.com/spreadsheets/d/{docid}/export?format=csv&gid={gid}`

## CLI tools

- `gsheet2csv` — Export sheet to CSV
- `gsheet2tsv` — Export sheet to TSV
- `gsheet2env` — Export sheet to .env file

## sqlc + csvutil

When using sqlc-generated structs with csvutil for TSV/CSV output, configure csvutil to use existing `json` tags:

```go
enc := csvutil.NewEncoder(w)
enc.Delimiter = '\t'
enc.Tag = "json"  // Use json tags from sqlc structs
```

sqlc generates structs with `json` tags by default. Avoid creating separate TSV-specific structs — use the same struct for JSON API responses and TSV exports.