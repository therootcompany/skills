---
name: postgres-pci-encrypt-sensitive
description: PostgreSQL my_encrypt() / my_decrypt() SQL functions for "sensitive" data (readable by developers in psql debug sessions). Use when the column must be encrypted at rest but developers routinely inspect cleartext for debugging. Key comes from GUC my.sensitive_data_key. Includes NULL passthrough.
---

## What "sensitive" means

"Sensitive" = encrypted at rest, but the cleartext is something developers
are allowed (and expected) to see in `psql` when debugging. The key lives in
`my.sensitive_data_key` and operators load it into their debug sessions.

Contrast with `postgres-pci-encrypt-unreadable`, where the key is
deliberately withheld from interactive sessions.

Pick based on operational rules, not data shape: the mechanism is identical.

## Critical rules

- MUST: Install `pgcrypto` extension first: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- MUST: Store output as `bytea`. Same reasoning as the unreadable variant.
- MUST: Pass NULL through as NULL (these functions do — see the CASE guards below).
- NEVER: Use `my_encrypt` for data the DB operator shouldn't see. That's `app_encrypt` / `postgres-pci-encrypt-unreadable`.
- PREFER: Wrap `my_decrypt()` in debug VIEWs for support staff and devs. A view like `CREATE VIEW users_debug AS SELECT id, my_decrypt(phone_enc) AS phone FROM users;` is exactly the intended use — any session that has `my.sensitive_data_key` loaded can `SELECT * FROM users_debug` and see cleartext, any session that doesn't just gets the decrypt error. This is the difference from the unreadable tier, which must *never* appear in a view.

## Migration

```sql
CREATE OR REPLACE FUNCTION my_key() RETURNS bytea
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    -- ::bytea cast wrapped so STABLE caches it per query.
    SELECT current_setting('my.sensitive_data_key')::bytea
$$;

CREATE OR REPLACE FUNCTION my_encrypt(text) RETURNS bytea
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    SELECT CASE
        WHEN $1 IS NULL THEN NULL
        ELSE encrypt(convert_to($1, 'UTF8'), my_key(), 'aes')
    END;
$$;

CREATE OR REPLACE FUNCTION my_decrypt(bytea) RETURNS text
LANGUAGE SQL STABLE PARALLEL SAFE AS $$
    SELECT CASE
        WHEN $1 IS NULL THEN NULL
        ELSE convert_from(decrypt($1, my_key(), 'aes'), 'UTF8')
    END;
$$;
```

Source: `~/Agents/bnna-pay/sql/migrations/2024-09-19-1600_function-sql-my-key-and-encrypt.up.sql`.

## Why STABLE, not IMMUTABLE

`my_key()` reads a GUC — different sessions see different values — so all
three functions are `STABLE`. Within one query they are deterministic; across
queries the key may change. Don't mark them `IMMUTABLE` — the planner would
cache results across queries, breaking key rotation.

## NULL handling

Both `my_encrypt` and `my_decrypt` wrap the work in a `CASE $1 IS NULL`:

- `my_encrypt(NULL)` → `NULL` (no pgcrypto call)
- `my_decrypt(NULL)` → `NULL`

This is the main behavioral difference from the unreadable variant, which
errors on NULL. If your column is `NOT NULL` the difference doesn't matter;
if it's nullable, use this one.

## Usage

```sql
-- load key (in a developer debug session)
SET my.sensitive_data_key = '\x5b1e9d4e749cc59d575fe414da0634a8';

-- insert
INSERT INTO users (id, phone_enc) VALUES ($1, my_encrypt($2));

-- read cleartext in psql
SELECT id, my_decrypt(phone_enc) AS phone FROM users WHERE id = $1;

-- nullable column — NULL passes through
UPDATE users SET phone_enc = my_encrypt(NULL) WHERE id = $1;
```

Connection string (pgx/libpq `options`):

```
postgres://user:pw@host/db?options=-c%20my.sensitive_data_key%3D%5Cx5b1e...
```

## Properties

- AES-CBC with PKCS padding (pgcrypto default for `'aes'`).
- Random IV per call, prepended to ciphertext — same value encrypted twice yields different `bytea`.
- Not STRICT — the `CASE` makes NULL handling explicit and visible in the function body.

## Related

- `postgres-pci-encrypt-unreadable` — same mechanism, operator-hidden key
- `postgres-encrypt` — index of encryption functions
