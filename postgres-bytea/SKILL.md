---
name: postgres-bytea
description: PostgreSQL bytea conversion functions — index. Use when a bytea column needs to be converted to UUID, URL-safe base64, or reversed in SQL. Points to focused skills per conversion.
---

## When bytea is the right column type

- MUST: Prefer the native `uuid` type for pure UUID columns. Only use `bytea` when the column is *also* used raw — as HMAC key, hash input, or random token source — so round-tripping through `::bytea` per query is avoided.
- MUST: Treat every `bytea` column as an opaque blob in the app layer; use a conversion function when you need a human-readable or wire-safe form.

## Focused skills

| Skill | When to use |
|-------|-------------|
| `postgres-bytea-uuid` | Column is `bytea` but rows are semantically UUIDs (join to `uuid` columns, display as UUID) |
| `postgres-urlsafe-base64` | Emit `bytea` as a URL-safe public token; parse one back in a WHERE clause |
| `postgres-bytea-reverse` | Index suffix lookups by reversing bytes — suffix queries become B-tree prefix scans |

All three conversion functions are `IMMUTABLE STRICT PARALLEL SAFE` and safe in
indexes and generated columns.

## Reverse direction cheat sheet

| Direction | Function | Source |
|-----------|----------|--------|
| `bytea` → `uuid` | `bytea_to_uuid(bytes)` | this skill's |
| `uuid` → `bytea` | `uuid_send(u)` | built-in |
| `bytea` → urlsafe b64 | `bytea_to_urlsafe_base64(bytes)` | this skill's |
| urlsafe b64 → `bytea` | `urlsafe_base64_to_bytea(txt)` | this skill's |
| `bytea` → reversed `bytea` | `bytea_reverse(bytes)` | this skill's |

## Related

- `postgres-encrypt` — encryption for bytea columns at rest (pgcrypto envelope)
- `postgres` — top-level PostgreSQL skills index
