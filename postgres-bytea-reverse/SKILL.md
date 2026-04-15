---
name: postgres-bytea-reverse
description: PostgreSQL bytea_reverse() SQL function. Use when reversing a byte array in-place in SQL — index prefix searches on the tail of a value, reverse-sort keys, or mirroring fixed-width tokens. Pure SQL, no plpgsql.
---

## What it does

Reverse a `bytea` value byte by byte in pure SQL.

```sql
bytea_reverse('\x01020304'::bytea)  -- returns '\x04030201'
```

## When to use it

- MUST: Reach for this when you want to index or query the **suffix** of a `bytea` column. Postgres only B-tree indexes prefixes; reverse the bytes, index the result, and suffix queries become prefix queries.
- PREFER: Store as a generated column if the reversed form is queried often — avoids recomputing on every read.
- AVOID: Using this for text-shaped data. For strings use `reverse(text)` (built-in).

## Migration

```sql
CREATE OR REPLACE FUNCTION bytea_reverse(bytes bytea)
RETURNS bytea
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT string_agg(substring(bytes FROM byte_pos FOR 1), '')
    FROM generate_series(octet_length(bytes), 1, -1) AS byte_pos;
$$;
```

Source: `~/Agents/bnna-pay/sql/migrations/2024-09-19-1400_function-sql-reverse-bytea.up.sql`.

## Usage

```sql
-- index the suffix of token for "ends with" lookups
ALTER TABLE api_keys
    ADD COLUMN token_rev bytea
    GENERATED ALWAYS AS (bytea_reverse(token)) STORED;

CREATE INDEX idx_api_keys_token_rev ON api_keys (token_rev);

-- "ends with \xDEADBEEF" becomes a prefix scan on token_rev
SELECT * FROM api_keys
WHERE token_rev >= bytea_reverse('\xDEADBEEF'::bytea)
  AND token_rev <  bytea_reverse('\xDEADBEEF'::bytea) || '\xFF'::bytea;
```

## Properties

- `IMMUTABLE STRICT PARALLEL SAFE` — safe in indexes and generated columns.
- Cost: one `generate_series` + `string_agg` per call. Fine for row-at-a-time; profile before using on wide scans.

## Related

- `postgres-bytea` — index of bytea conversion functions
- `postgres-bytea-uuid`, `postgres-urlsafe-base64` — other bytea shape-shifters
