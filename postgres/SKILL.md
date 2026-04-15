---
name: postgres
description: PostgreSQL index skill — deploy, bytea conversion, and pgcrypto column encryption. Use when installing postgres, picking a bytea conversion, or choosing between the two column-encryption variants. Points to focused skills.
---

## Focused skills

### Server deployment

| Skill | When to use |
|-------|-------------|
| `bnna-postgres` | Install postgres on a Linux VM via webi, behind a TLS router or local-only |
| `bnna-postgres-build` | Build a portable postgres binary from source for webi |
| `bnna-postgres-setup` | Per-host setup steps after `bnna-postgres` install |
| `bnna-infra-postgres-setup` | BNNA-wide infra conventions for postgres |

### bytea conversions

| Skill | When to use |
|-------|-------------|
| `postgres-bytea` | Index — pick the right bytea conversion |
| `postgres-bytea-uuid` | `bytea` ↔ `uuid` in pure SQL |
| `postgres-urlsafe-base64` | `bytea` ↔ URL-safe base64 text |
| `postgres-bytea-reverse` | Reverse a `bytea` — enables suffix-as-prefix B-tree index tricks |

### Column encryption (pgcrypto)

| Skill | When to use |
|-------|-------------|
| `postgres-encrypt` | Index — pick unreadable vs sensitive |
| `postgres-pci-encrypt-unreadable` | Cleartext must not appear in operator psql sessions (PCI, API secrets) |
| `postgres-pci-encrypt-sensitive` | Cleartext is OK in developer debug sessions; has NULL passthrough |

### Migrations

| Skill | When to use |
|-------|-------------|
| `use-sql-migrate-postgres` | Run sql-migrate against a postgres target |
| `sql-db-migrations` | Migration conventions across engines |

## Related

- `connect-to-mysql` / `connect-to-sqlserver` — non-postgres connection skills
- `paperos-use-ssh-tls-tunnel-postgres-mariadb` — SSH/TLS tunnel for remote postgres
