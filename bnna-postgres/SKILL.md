---
name: bnna-postgres
description: Deploy PostgreSQL via webi on a Linux VM. Use when installing postgres on a fresh server, setting up remote access, configuring pg_hba, creating users/groups with pg-essentials, or running postgres behind a TLS router (Proxmox ALPN). Covers webi install, serviceman service, port config, remote_users group, ssl-off for TLS proxy.
---

<!-- core -->

## Critical Rules

- MUST: Run `webi postgres` as the service user (e.g. `app`), NOT root — `initdb` fails as root.
- MUST: Set port in both `postgresql.conf` AND the serviceman `ExecStart` `-p` flag — the flag overrides the conf.
- MUST: Install `unzip` before `webi serviceman` on Ubuntu (`apt-get install -y unzip`).
- MUST: Set `dynamic_shared_memory_type = mmap` in `postgresql.conf` on systemd systems — systemd periodically reaps `/dev/shm` for login users (like `/tmp`), destroying POSIX shared memory objects and breaking postgres IPC; `mmap` uses file-backed shared memory that isn't subject to this cleanup.
- NEVER: Enable SSL in postgres when sitting behind a TLS router — the router terminates TLS; use `host` not `hostssl` in pg_hba.

<!-- /core -->

## 1. Prerequisites

```sh
# On Ubuntu, unzip is required by webi serviceman
apt-get install -y unzip
```

## 2. Install PostgreSQL (as service user)

MUST: Run as the non-root user who will own the postgres process (e.g. `app`).

```sh
su - app -s /bin/bash -c "curl -sS https://webi.sh/postgres | sh"
```

# VERIFY: initdb output ends with "Database initialized at: /home/app/.local/share/postgres/var"

## 3. Register as a systemd service

```sh
su - app -s /bin/bash -c "
. ~/.config/envman/PATH.env
webi serviceman
serviceman add --name postgres \
  --workdir /home/app/.local/share/postgres/var \
  -- postgres -D /home/app/.local/share/postgres/var -p <PORT>
"
systemctl enable postgres
systemctl start postgres
```

**Port choices:**

| Context | Port |
|---------|------|
| Local-only (no remote access) | 5432 |
| Behind Proxmox TLS router (ALPN `postgresql`) | 15432 |

# VERIFY:
```sh
systemctl status postgres --no-pager | head -5
# Active: active (running)
journalctl -u postgres --no-pager -n 3
# LOG: listening on ... port <PORT>
```

## 4. Fix the service port

The serviceman `ExecStart` `-p` flag overrides `postgresql.conf`. After changing the port, update both:

```sh
# Fix postgresql.conf
sed -i "s/^#*port = .*/port = <PORT>/" /home/app/.local/share/postgres/var/postgresql.conf

# Fix service file
sed -i 's/"-p" "<OLD>"/"-p" "<NEW>"/' /etc/systemd/system/postgres.service

systemctl daemon-reload && systemctl restart postgres
```

## 5. TLS Router setup (Proxmox ALPN postgresql → port 15432)

When postgres sits behind the Proxmox TLS router:

- Set port to **15432** (TLS router maps external 443 ALPN `postgresql` → container port 15432)
- Disable SSL in postgres (router terminates TLS)
- Use `host` not `hostssl` in pg_hba

```sh
PGDATA=/home/app/.local/share/postgres/var
sed -i 's/^ssl = on/ssl = off/' $PGDATA/postgresql.conf
sed -i 's/^hostssl/host/g' $PGDATA/pg_hba.conf
# mmap: systemd reaps /dev/shm periodically (like /tmp); mmap uses file-backed shm
sed -i "s/^#*dynamic_shared_memory_type = .*/dynamic_shared_memory_type = mmap/" $PGDATA/postgresql.conf
systemctl restart postgres
```

External connection string (from dev machine via TLS router):
```
postgres://user:pass@tls-<IP>.vms.example.com/dbname?sslmode=require&sslnegotiation=direct
```
No port needed — TLS router listens on 443.
`sslnegotiation=direct` is required: the TLS router uses ALPN `postgresql` and
expects the client to open with TLS immediately (like HTTPS), not PostgreSQL's
traditional plain-text SSL upgrade handshake (the default `sslnegotiation=postgres`).

## 6. Create users with pg-essentials

```sh
su - app -s /bin/bash -c "curl -sS https://webi.sh/pg-essentials | sh"
```

### Remote access group

```sh
su - app -s /bin/bash -c "
. ~/.config/envman/PATH.env
# 'hostssl' in group name is an auth hint to pg-addgroup; we change it to 'host' in step 5
pg-addgroup hostssl remote_users <PORT>
pg-adduser <prefix> <PORT> remote_users
"
```

Output includes the generated username, password, and connection string. Save the password — it's shown only once.

### Local-only superuser access (for migrations/admin)

Connect via Unix socket as the `app` OS user:

```sh
sudo -u app /home/app/.local/opt/postgres/bin/psql postgres -c "CREATE DATABASE mydb;"
sudo -u app /home/app/.local/opt/postgres/bin/psql postgres -c "CREATE USER myuser WITH PASSWORD 'secret';"
sudo -u app /home/app/.local/opt/postgres/bin/psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE mydb TO myuser;"
sudo -u app /home/app/.local/opt/postgres/bin/psql mydb -c "GRANT ALL ON SCHEMA public TO myuser;"
```

NEVER: Use `su - app -c "psql ..."` for admin commands — `su` prompts for password interactively in non-TTY sessions. Use `sudo -u app` instead.

## 7. Verify remote connection

```sh
# From local VM
su - app -s /bin/bash -c ". ~/.config/envman/PATH.env && psql 'postgres://user:pass@localhost:<PORT>/dbname' -c 'SELECT 1 AS ok;'"
# ok
# ----
#   1
```

## pg_hba.conf quick reference

```
# Local OS-user connections (peer/password)
local   all   all                           password
host    all   all   127.0.0.1/32            password
host    all   all   ::1/128                 password

# Remote users group (added by pg-addgroup)
host    sameuser   +remote_users   0.0.0.0/0   scram-sha-256
host    sameuser   +remote_users   ::0/0        scram-sha-256
```

## Related skills

- `proxmox` — VM provisioning (run before this skill)
- `proxmox-dns` — map a friendly domain to the VM
- `go-db-migrations` — run sql-migrate after postgres is up
