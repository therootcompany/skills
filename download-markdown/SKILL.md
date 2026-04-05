---
name: download-markdown
description: Download webpages and convert to Markdown, or recursively download website sections. Use when saving documentation for offline use, converting HTML documentation to Markdown, archiving web content, or processing API documentation. Covers URL downloading, HTML conversion, recursive downloads, and markdown detection with Accept headers and .md extensions.
---

# Download Markdown

Download webpages and convert to Markdown, or recursively download website sections.

## Quick Start

```sh
# Download single URL to stdout
./scripts/download-markdown.cjs https://docs.example.com/article

# Save to file
./scripts/download-markdown.cjs https://docs.example.com/article ./docs/article.md

# Download with markdown detection (try .md first)
./scripts/download-markdown.cjs --detect-md https://docs.example.com/page

# Recursively download website section
./scripts/website-download-recursive.sh https://docs.example.com/api ./docs

# Convert downloaded HTML to Markdown
./scripts/html-to-markdown-recursive.cjs ./downloaded ./markdown-docs
```

## Scripts

| Script | Purpose |
|--------|---------|
| `download-markdown.cjs` | Download single URL, convert to Markdown |
| `html-to-markdown-recursive.cjs` | Convert existing HTML files to Markdown |
| `website-download-recursive.sh` | Recursively download website with wget |

## Dependencies

```sh
# Install Node.js dependencies
npm install @mozilla/readability turndown jsdom

# wget (for recursive downloads)
webi wget
```

## 1. Download Single URL

### Basic Usage

```sh
./scripts/download-markdown.cjs <url> [output]
```

**Output to stdout:**
```sh
./scripts/download-markdown.cjs https://example.com/article > article.md
```

**Save to file:**
```sh
./scripts/download-markdown.cjs https://example.com/article ./docs/article.md
```

### Options

| Flag | Description |
|------|-------------|
| `--detect-md` | Check if site serves Markdown directly first |
| `--no-readability` | Skip content extraction, convert full HTML |
| `--frontmatter` | Add YAML frontmatter with metadata |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

### Markdown Detection Strategy

When `--detect-md` is used, the script tries multiple strategies in order:

| Priority | Strategy | Example |
|----------|----------|---------|
| 1 | `.md` extension | `/page` → `/page.md` |
| 2 | `.markdown` extension | `/page` → `/page.markdown` |
| 3 | `index.md` in directory | `/api/` → `/api/index.md` |
| 4 | Replace `.html` with `.md` | `/page.html` → `/page.md` |
| 5 | `README.md` in directory | `/api/` → `/api/README.md` |
| 6 | `Accept: text/markdown` header | Original URL with markdown Accept |
| 7 | Parse HTML for `.md` links | Find anchor links to `.md` files |
| 8 | Parse HTML for edit/source links | Find "Edit" or "View Source" buttons |

The script detects Markdown by:
- **Content-Type header**: `text/markdown` or `text/x-markdown`
- **Content sniffing**: Starts with `#` or contains `---\n` (frontmatter) or `[text](url)` (links)

#### HTML Link Detection

After trying URL variants and Accept header, the script parses the HTML page to find:

1. **Direct markdown links**: `<a href="page.md">` anchors
2. **Edit/Source buttons**: Links with `rel="edit"`, `rel="source"`, or text like "Edit", "View Source", "Edit this page"
3. **Raw repository links**: GitHub/GitLab raw URLs (e.g., `raw.githubusercontent.com`)

These patterns are common in:
- **GitHub Pages**: "Edit this page" buttons pointing to GitHub raw files
- **GitLab**: "View source" links to raw markdown
- **Docusaurus**: `_category_.json` + `.md` file structure
- **ReadMe.io**: "Edit on GitHub" links
- **MkDocs**: Edit buttons pointing to source markdown

**Example: NMI Documentation**

NMI docs serve Markdown directly:
```sh
./scripts/download-markdown.cjs --detect-md \
  https://docs.nmi.com/reference/getting-started \
  ./nmi/getting-started.md
```

This tries:
1. `https://docs.nmi.com/reference/getting-started.md`
2. `https://docs.nmi.com/reference/getting-started.markdown`
3. `https://docs.nmi.com/reference/getting-started/index.md`
4. etc.

If none found, falls back to HTML conversion.

### Readability Extraction

Uses @mozilla/readability to extract article content:

```sh
# Extracts main content, removes nav/ads/etc
./scripts/download-markdown.cjs https://blog.example.com/long-article ./article.md
```

## 2. Recursively Download Website

### Basic Usage

```sh
./scripts/website-download-recursive.sh <base-url> [output-dir]
```

**Download API docs:**
```sh
./scripts/website-download-recursive.sh \
  https://docs.example.com/api \
  ./docs/api
```

### Options

| Flag | Description |
|------|-------------|
| `--depth N` | Maximum recursion depth (default: 5) |
| `--wait N` | Wait N seconds between requests (default: 1) |
| `--convert-links` | Convert links for offline viewing |
| `--mirror` | Mirror mode (preserve structure, all files) |
| `--no-images` | Skip image downloads |
| `--no-css` | Skip CSS downloads |
| `--dry-run` | Preview command without executing |

### Respectful Crawling

```sh
# Be nice to servers
./scripts/website-download-recursive.sh \
  --wait 2 \
  --depth 3 \
  https://docs.example.com/api \
  ./docs/api
```

### Mirror Entire Site

```sh
./scripts/website-download-recursive.sh \
  --mirror \
  --convert-links \
  https://example.com \
  ./mirror
```

## 3. Convert HTML to Markdown

After downloading with wget, convert to Markdown:

### Basic Usage

```sh
./scripts/html-to-markdown-recursive.cjs <input> <output>
```

**Convert directory:**
```sh
./scripts/html-to-markdown-recursive.cjs \
  ./downloaded \
  ./markdown-docs
```

### Options

| Flag | Description |
|------|-------------|
| `--clean` | Remove original HTML after conversion |
| `--flatten` | Flatten output structure |
| `--strip-prefix` | Strip common directory prefix |
| `--frontmatter` | Add YAML frontmatter |
| `--no-readability` | Convert full HTML without extraction |
| `--dry-run` | Preview without converting |

### Convert Single File

```sh
./scripts/html-to-markdown-recursive.cjs \
  ./downloaded/article.html \
  ./docs/article.md
```

### Clean Up After Conversion

```sh
./scripts/html-to-markdown-recursive.cjs \
  --clean \
  --frontmatter \
  ./downloaded \
  ./markdown-docs
```

## Complete Workflow

### Archive Documentation Site (Smart Detection)

```sh
# 1. Try to download with markdown detection first
./scripts/download-markdown.cjs \
  --detect-md \
  --frontmatter \
  https://docs.nmi.com/reference/getting-started \
  ./nmi/getting-started.md

# 2. If markdown detection works, use recursive wget on .md files
# Or download HTML and convert
./scripts/website-download-recursive.sh \
  --depth 5 \
  --wait 1 \
  https://docs.nmi.com/reference \
  ./nmi/html

# 3. Convert to Markdown
./scripts/html-to-markdown-recursive.cjs \
  --frontmatter \
  ./nmi/html \
  ./nmi/markdown
```

### API Reference Download

```sh
# Quick test - does this site serve markdown?
./scripts/download-markdown.cjs --detect-md \
  https://docs.nmi.com/reference/getting-started \
  ./test.md

# If yes, you can construct markdown URLs directly
# If no, use recursive download + convert
```

## Markdown Detection Reference

### Sites Known to Serve Markdown

| Site | Pattern | Example |
|------|---------|---------|
| GitHub | Raw files | `https://raw.githubusercontent.com/...` |
| GitLab | Raw files | `https://gitlab.com/.../-/raw/...` |
| NMI Docs | `.md` extension | `https://docs.nmi.com/reference/page.md` |
| ReadMe.io | `Accept: text/markdown` | Original URL with header |
| Docusaurus | `_category_.json` | Check for `.md` files |
| MkDocs | `index.md` | `/page/` → `/page/index.md` |

### Content-Type Headers

The script looks for:
- `text/markdown` - Standard markdown mime type
- `text/x-markdown` - Alternative markdown mime type
- `text/plain` with markdown content - Sniffed by content

### Markdown Content Sniffing

When Content-Type is ambiguous, checks for:
- Starts with `#` (ATX heading)
- Contains `---\n` (YAML frontmatter)
- Contains `[text](url)` (Markdown link syntax)
- Contains `## ` (ATX subheading)

## Output Structure

**wget recursive:**
```
downloaded/
└── docs.example.com/
    ├── api/
    │   ├── index.html
    │   └── authentication.html
    └── guides/
        └── getting-started.html
```

**After HTML-to-Markdown:**
```
markdown-docs/
├── api/
│   ├── index.md
│   └── authentication.md
└── guides/
    └── getting-started.md
```

## Frontmatter

With `--frontmatter`, generated files include:

```yaml
---
title: "Page Title"
byline: "Author Name"
source: "https://docs.example.com/article"
date: "2026-04-05T03:00:00.000Z"
---
```

## Troubleshooting

### "Cannot find module" errors

```sh
# Install dependencies
npm install @mozilla/readability turndown jsdom
```

### wget not found

```sh
webi wget
```

### Markdown not detected

Some sites serve markdown but don't use standard extensions. Try manual URLs:

```sh
# Direct .md test
curl -I https://docs.example.com/page.md

# Accept header test
curl -H "Accept: text/markdown" https://docs.example.com/page
```

If detected, you can construct URLs manually or use the detection results.

### Empty output from readability

Some pages fail extraction. Use `--no-readability` to convert full HTML:

```sh
./scripts/download-markdown.cjs --no-readability https://example.com/page
```

### Rate limited

Increase wait time:

```sh
./scripts/website-download-recursive.sh --wait 5 https://example.com/docs
```

## Script Versions

- `download-markdown.js`: 1.0.0
- `html-to-markdown-recursive.js`: 1.0.0
- `website-download-recursive.sh`: 1.0.0

Bump versions when updating scripts.
