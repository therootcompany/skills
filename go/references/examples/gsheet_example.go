//go:build ignore

package gsheet_example

import (
	"fmt"
	"os"

	"github.com/therootcompany/golib/io/transform/gsheet2csv"
)

// Example: Read Google Sheet from URL
func ExampleReadFromURL() {
	// Parse any Google Sheet URL format:
	// - Edit URL: https://docs.google.com/spreadsheets/d/{docid}/edit?gid={gid}
	// - Share URL: https://docs.google.com/spreadsheets/d/{docid}/edit?usp=sharing
	// - Export URL: https://docs.google.com/spreadsheets/d/{docid}/export?format=csv&gid={gid}
	r := gsheet2csv.NewReaderFromURL("https://docs.google.com/spreadsheets/d/XXXXX/edit?gid=0")
	records, err := r.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading from %s: %v\n", r.URL, err)
		os.Exit(1)
	}
	// r.DocID and r.GID are populated

	fmt.Printf("DocID: %s, GID: %s\n", r.DocID, r.GID)
	for i, row := range records {
		fmt.Printf("Row %d: %v\n", i, row)
	}
}

// Example: Read from local CSV file
func ExampleReadFromFile() {
	r := gsheet2csv.NewReaderFrom("./data.csv")
	r.Comment = '#' // Skip comment lines

	records, err := r.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	_ = records
}

// Example: Parse Google Sheet IDs from URL
func ExampleParseIDs() {
	docid, gid := gsheet2csv.ParseIDs("https://docs.google.com/spreadsheets/d/1ABC123/edit?gid=456")
	fmt.Printf("DocID: %s, GID: %s\n", docid, gid)
}

// Example: Write TSV output
func ExampleWriteTSV() {
	r := gsheet2csv.NewReaderFromURL("https://docs.google.com/spreadsheets/d/XXXXX/edit")
	records, _ := r.ReadAll()

	w := gsheet2csv.NewWriter(os.Stdout)
	w.Comma = '\t'  // TSV output
	w.Comment = '#' // Preserve comment lines
	_ = w.WriteAll(records)
}

// Example: Convert CSV delimiter
func ExampleConvertDelimiter() {
	r := gsheet2csv.NewReaderFrom("./data.csv")
	records, _ := r.ReadAll()

	w := gsheet2csv.NewWriter(os.Stdout)
	w.Comma = '\t' // Convert to TSV
	_ = w.WriteAll(records)
}