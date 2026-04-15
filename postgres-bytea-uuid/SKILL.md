---
name: postgres-bytea-uuid
description: PostgreSQL bytea_to_uuid() SQL function. Use when storing UUIDs as bytea but querying or joining as UUID, or when converting bytea columns back to UUID for display. Covers the forward direction (bytea to UUID); uuid_send() is the built-in reverse.
---

## What it does

Cast 16-byte `bytea` to `UUID` in SQL. Reciprocal to the built-in `uuid_send(uuid) RETURNS bytea`.

- Forward: `bytea_to_uuid(bytes bytea) RETURNS uuid` — this skill's function.
- Reverse: `uuid_send(u uuid) RETURNS bytea` — built in, nothing to install.

## Why bytea, not uuid, on the column

- MUST: Store raw 16-byte `bytea` when the column is also used as a hash input, HMAC key, or random token source — avoids per-row `::bytea` casts on hot paths.
- PREFER: Use the native `uuid` type when the column is only ever a UUID. Only reach for `bytea` + `bytea_to_uuid()` when you genuinely need both shapes.

## Migration

```sql
CREATE OR REPLACE FUNCTION "public"."bytea_to_uuid"(bytes bytea)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT encode(bytes, 'hex')::UUID;
$$;
```

Source: `~/Agents/bnna-pay/sql/migrations/2024-09-19-1100_function-sql-uuid.up.sql`.

## Usage

```sql
-- column is bytea, view as UUID
SELECT bytea_to_uuid(id) AS id FROM accounts WHERE id = uuid_send('...'::uuid);

-- join bytea column to uuid column
SELECT *
FROM a JOIN b ON bytea_to_uuid(a.id_bytes) = b.id_uuid;
```

## Properties that matter

- `IMMUTABLE STRICT PARALLEL SAFE` — safe in indexes, generated columns, parallel queries.
- `STRICT` means `NULL` in, `NULL` out — no explicit null handling needed.
- `encode(..., 'hex')::UUID` validates length: wrong-size `bytea` raises at cast time.

## Related

- `postgres-bytea` — index of bytea conversion functions
- `postgres-urlsafe-base64` — bytea ↔ URL-safe base64 for public IDs
