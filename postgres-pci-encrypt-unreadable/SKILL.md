---
name: postgres-pci-encrypt-unreadable
description: PostgreSQL app_encrypt() / app_decrypt() SQL functions for "unreadable" data (PCI, secrets). Use when storing PANs, full card numbers, API secrets, or anything that must be opaque to DB operators in psql. Key comes from GUC app.unreadable_data_key.
---

## What "unreadable" means

"Unreadable" = the DB operator running `psql` as a privileged user should NOT
be able to decrypt the column casually. The key lives in a GUC that the client
sets per session (or is never set in interactive sessions at all), so
`SELECT app_decrypt(col)` returns gibberish or errors for anyone without the
key loaded.

Contrast with `postgres-pci-encrypt-sensitive`, where `my.sensitive_data_key`
is allowed to be set in developer debug sessions.

## Critical rules

- MUST: Install `pgcrypto` extension first: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- MUST: Set `app.unreadable_data_key` in the client connection string or session, NOT in `postgresql.conf`. Putting it in the conf file defeats the purpose.
- MUST: Store encrypted output as `bytea`. Do not base64 on write — it doubles storage and leaks length bands.
- NEVER: `SELECT app_decrypt(col)` in a query logged by `pg_stat_statements` or `log_statement=all` without scrubbing. The key is not in the log but the cleartext will be.
- NEVER: Use this for data that developers routinely need to read in psql — use `postgres-pci-encrypt-sensitive` for that.
- NEVER: Wrap `app_decrypt()` in a persistent VIEW. Views let any operator run `SELECT * FROM the_view` and surface cleartext, which defeats the whole "key loaded only in app sessions" design. Keep `app_decrypt()` strictly on the app-server code path; if a developer needs to see the value, they switch to the `my_*` (sensitive) tier instead. `postgres-pci-encrypt-sensitive` is the tier that's safe to put in views.

## Migration

```sql
CREATE OR REPLACE FUNCTION app_unreadable_data_key() RETURNS bytea
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    -- ::bytea cast breaks STABLE caching of current_setting('app.foo');
    -- wrapping in a function makes the cast happen once per query.
    SELECT current_setting('app.unreadable_data_key')::bytea
$$;

CREATE OR REPLACE FUNCTION app_encrypt(plain_text text) RETURNS bytea
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    -- encrypt(data bytea, key bytea, type text) — default type is 'aes-cbc/pad:pkcs'
    SELECT encrypt(convert_to(plain_text, 'UTF8'), app_unreadable_data_key(), 'aes')
$$;

CREATE OR REPLACE FUNCTION app_decrypt(encrypted_data bytea) RETURNS text
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    SELECT convert_from(decrypt(encrypted_data, app_unreadable_data_key(), 'aes'), 'UTF8')
$$;
```

Source: `~/Agents/bnna-pay/sql/migrations/2024-09-19-1500_function-sql-app-key-and-encrypt.up.sql`.

## Why all three functions are STABLE

The key can change between sessions (different GUC value per connection).
`STABLE` lets the planner cache within one query — the `::bytea` cast and
`encrypt()`/`decrypt()` calls run once per distinct input, not once per row.
`IMMUTABLE` would let the planner cache across queries, which is wrong when
the key changes (e.g. key rotation, connection pooling, different app
instances).

## Usage

```sql
-- set key per session (e.g. in connection string options)
SET app.unreadable_data_key = '\x5b1e9d4e749cc59d575fe414da0634a8';

-- insert encrypted
INSERT INTO payments (id, card_pan) VALUES ($1, app_encrypt($2));

-- read back (same session, key still set)
SELECT id, app_decrypt(card_pan) AS pan FROM payments WHERE id = $1;
```

Connection string (pgx/libpq `options`):

```
postgres://user:pw@host/db?options=-c%20app.unreadable_data_key%3D%5Cx5b1e...
```

## Properties

- AES-CBC with PKCS padding (pgcrypto default for `'aes'`).
- No IV argument: pgcrypto derives a random IV and prepends it to the ciphertext. Good — don't try to "fix" it by passing a fixed IV.
- Same value encrypted twice yields different `bytea` (random IV).
- `STRICT` is deliberately NOT set on `app_encrypt` — it rejects NULL input loudly by erroring in `convert_to`. Use a CASE if you need NULL passthrough (see `postgres-pci-encrypt-sensitive` for a version with built-in NULL passthrough).

## Related

- `postgres-pci-encrypt-sensitive` — same idea, key name `my.sensitive_data_key`, developer-readable
- `postgres-encrypt` — index of encryption functions
