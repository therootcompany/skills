---
name: postgres-encrypt
description: PostgreSQL column encryption via pgcrypto — index. Use when choosing between "unreadable" (operator-hidden) and "sensitive" (developer-readable) encrypted columns, or when adding a new encrypted field and need to decide which key to use.
---

## Pick by operational rule, not data shape

The two variants use the same AES-CBC mechanism. They differ only in **who is
allowed to load the key**:

| Skill | GUC | Readable in psql by... | NULL handling |
|-------|-----|------------------------|---------------|
| `postgres-pci-encrypt-unreadable` | `app.unreadable_data_key` | app servers only, never in interactive sessions | errors on NULL |
| `postgres-pci-encrypt-sensitive` | `my.sensitive_data_key` | app servers *and* developers debugging locally | NULL passthrough |

PCI PANs, CVV, secrets the DB operator isn't cleared for → **unreadable**.
Personal info that on-call devs debug daily → **sensitive**.

## Shared prerequisites

- MUST: `CREATE EXTENSION IF NOT EXISTS pgcrypto;` before running either migration.
- MUST: Store the ciphertext as `bytea`. Don't base64 on write.
- MUST: Pass the key via libpq `options=-c <guc>=\x<hex>` or `SET` in-session. Never put it in `postgresql.conf`.
- NEVER: Mix the two key namespaces — a column encrypted with `app_encrypt` must always be decrypted with `app_decrypt`, and likewise for `my_*`. They use different GUCs.

## Why all functions are STABLE

Both variants mark all three functions (`*_key()`, `*_encrypt()`,
`*_decrypt()`) as `STABLE`. That's deliberate:

- `IMMUTABLE` would let the planner cache results *across* queries — wrong,
  the key can change between sessions (connection pooling, key rotation).
- `STABLE` caches within one query — right, the `::bytea` cast and
  `encrypt()`/`decrypt()` calls run once per distinct input, not once per row.

A common mistake is marking `*_encrypt`/`*_decrypt` as `IMMUTABLE` because
"same input + same key = same output". That's true within one query, but the
key can change between queries (different session, connection pool rotation,
key rotation). `STABLE` is correct for all three functions in each variant.

## Focused skills

| Skill | When to use |
|-------|-------------|
| `postgres-pci-encrypt-unreadable` | Cleartext is forbidden in interactive sessions. PCI, API secrets, customer credentials. |
| `postgres-pci-encrypt-sensitive` | Cleartext is allowed in debug sessions. Personal data devs routinely inspect. |

## Related

- `postgres` — top-level PostgreSQL skills index
- `postgres-bytea` — bytea conversion helpers (the column type all encrypted values land in)
