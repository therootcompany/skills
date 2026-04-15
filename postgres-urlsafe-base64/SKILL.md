---
name: postgres-urlsafe-base64
description: PostgreSQL bytea_to_urlsafe_base64() and urlsafe_base64_to_bytea() SQL functions. Use when emitting bytea columns as URL-safe public IDs (tokens, slugs, opaque pagination cursors) or parsing them back in WHERE clauses. Covers RFC 4648 §5 alphabet (no +/, no = padding).
---

## What it does

Convert between `bytea` and URL-safe base64 text (RFC 4648 §5):

- `bytea_to_urlsafe_base64(bytes bytea) RETURNS text`
- `urlsafe_base64_to_bytea(urlbase64 text) RETURNS bytea`

Alphabet: `A-Z a-z 0-9 - _`. No `+`, no `/`, no `=` padding. Safe in URLs, filenames, and HTTP headers without escaping.

## Why

- MUST: Use this when a `bytea` token leaves the DB as a public identifier. Standard `encode(b, 'base64')` emits `+`, `/`, `=` — all three must be percent-encoded in URLs.
- PREFER: This over a Go/Node round-trip when the query can return the string directly — one less cast, one less allocation.

## Migration

```sql
CREATE OR REPLACE FUNCTION bytea_to_urlsafe_base64(bytes bytea)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT replace(replace(rtrim(encode(bytes, 'base64'), '='), '+', '-'), '/', '_');
$$;

CREATE OR REPLACE FUNCTION urlsafe_base64_to_bytea(urlbase64 TEXT)
RETURNS bytea LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT decode(
        REPLACE(REPLACE(urlbase64, '-', '+'), '_', '/') ||
        repeat('=', (4 - (length(urlbase64) % 4)) % 4),
        'base64'
    );
$$;
```

Source: `~/Agents/bnna-pay/sql/migrations/2024-09-19-1300_function-sql-urlsafe-base64.up.sql`.

## Usage

```sql
-- emit public token from bytea column
SELECT bytea_to_urlsafe_base64(token) AS token FROM api_keys WHERE id = $1;

-- look up by URL-supplied token
SELECT * FROM api_keys WHERE token = urlsafe_base64_to_bytea($1);

-- generated column for always-on public form
ALTER TABLE api_keys ADD COLUMN token_b64 TEXT
    GENERATED ALWAYS AS (bytea_to_urlsafe_base64(token)) STORED;
```

## Properties

- `IMMUTABLE STRICT PARALLEL SAFE` — safe in indexes and generated columns.
- Padding is stripped on encode and re-added on decode via `(4 - len%4) % 4`.
- `STRICT` — `NULL` in, `NULL` out.

## Related

- `postgres-bytea` — index of bytea conversion functions
- `postgres-bytea-uuid` — bytea ↔ UUID
