---
name: connect-to-mysql
description: >
  Connect to MySQL/MariaDB from a dev machine. Use when setting up SSH tunnels,
  testing queries, or configuring Go DSNs for MySQL/MariaDB instances behind TLS
  proxies or private networks.
---

## Connection Patterns

MariaDB instances in the BNNA cluster sit behind a TLS Router (SNI+ALPN).
There are three ways to connect, depending on what's configured.

### What the LOCAL.md URLs look like

```
# External (TLS Router on :443, SNI+ALPN routed)
mysql://user:pass@tls-10-11-10-22.a.bnna.net:443/db
# Internal (plain MySQL on :13306, via tcpfwd to :3306)
mysql://user:pass@172.24.0.22:13306/db
```

### Server architecture

```
TLS Router (:443) --terminates TLS--> 172.24.0.22:13306 (tcpfwd) --> 172.24.0.22:3306 (MariaDB)
```

- **3306** — MariaDB's actual listener (`bind-address = 0.0.0.0`)
- **13306** — `tcpfwd 13306:172.24.0.22:3306` — plain TCP forwarder so MariaDB
  sees connections from 172.24.0.22 instead of localhost
- `require_secure_transport` is OFF — TLS Router handles encryption in transit

### Option 1: sclient direct (recommended)

The simplest approach. The client sends plain MySQL, sclient wraps it in TLS,
the TLS Router unwraps and forwards plain TCP to the backend. No STARTTLS
negotiation — the MySQL client doesn't know TLS is involved.

```sh
sclient --alpn mysql tls-10-11-10-22.a.bnna.net:443 localhost:23306

mariadb --host=127.0.0.1 --port=23306 --skip-ssl \
    --user=myuser --password='mypass' --database=mydb \
    -e "SELECT 1"
```

Go DSN: `myuser:mypass@tcp(127.0.0.1:23306)/mydb?multiStatements=true&parseTime=true`

The TLS Router has `mysql` in its `terminatedPortMap` (port 13306), added in
bnnanet/tlsrouter#22. The backend host must have `tcpfwd 13306:<ip>:3306`
running.

### Option 2: sclient + SSH tunnel (fallback)

Use sclient as an SSH ProxyCommand to reach the MariaDB host, then forward
to its local port 3306 (plain MySQL):

```sh
ssh -o ProxyCommand='sclient --alpn ssh %h' -fnNT \
    -L 23306:localhost:3306 \
    tls-10-11-10-22.a.bnna.net

mariadb --host=127.0.0.1 --port=23306 --skip-ssl \
    --user=myuser --password='mypass' --database=mydb \
    -e "SELECT 1"
```

Go DSN: `myuser:mypass@tcp(127.0.0.1:23306)/mydb?multiStatements=true`

For persistent use, add an SSH config block:

```ssh-config
Host mariadb-bnna tls-10-11-10-22.a.bnna.net
    Hostname tls-10-11-10-22.a.bnna.net
    ProxyCommand sclient --alpn ssh %h
    LocalForward 23306 localhost:3306
```

Then just `ssh -fnNT mariadb-bnna` to start the tunnel.

**How it works:** sclient tunnels SSH (ALPN=ssh) through the TLS Router.
SSH forwards to localhost:3306, which is a plain MySQL socket.

```sh
# VERIFY: must print a number
mariadb --host=127.0.0.1 --port=23306 --skip-ssl \
    --user=myuser --password='mypass' --database=mydb \
    -BNe "SELECT 1"
```

**Cleanup:**

```sh
kill $(pgrep -f 'ssh.*23306.*tls-10-11-10-22') 2>/dev/null
```

### Option 3: SSH through Proxmox node (fallback)

If you don't have SSH access to the MariaDB host, tunnel through a
Proxmox node on the same network:

```sh
ssh -o ConnectTimeout=5 -fnNT \
    -L 23306:172.24.0.22:13306 \
    bn1.pvec-slc1.a.bnna.net

mariadb --host=127.0.0.1 --port=23306 --skip-ssl \
    --user=myuser --password='mypass' --database=mydb \
    -e "SELECT 1"
```

Go DSN: `myuser:mypass@tcp(127.0.0.1:23306)/mydb?multiStatements=true`

This works because the SSH tunnel reaches the internal network, and
`tcpfwd` on 13306 forwards to MariaDB on 3306. No TLS at the MySQL
layer — the SSH tunnel provides encryption.

## Go DSN Format

The go-sql-driver/mysql DSN is NOT a URL:

```
user:pass@tcp(host:port)/dbname?param=value
```

All three connection methods deliver plain MySQL to the client, so no
`tls=` parameter is needed:

```
multiStatements=true     # required for migration runners
parseTime=true           # required for sql.NullTime / time.Time scanning
```

### Go code through the TLS Router

go-sql-driver does STARTTLS (MySQL protocol upgrade after greeting), but the
TLS Router needs direct TLS from the first byte. A custom dialer registered
via `mysql.RegisterDialContext` does `tls.DialWithDialer` with ALPN=mysql and
hands the decrypted stream to go-sql-driver as plain TCP.

**Use `MariaOpen()` instead of raw `sql.Open("mysql", ...)`.**

`MariaOpen(ctx, rawDSN)` in `internal/bndb/dsn.go` handles everything:

- Converts mysql:// URLs to go-sql-driver format
- On port 443 without explicit `tls=x-direct-sni-alpn`, races two connections
  in parallel (direct TLS via custom dialer vs STARTTLS, 5s timeout) —
  whichever succeeds first wins, the loser is closed
- With explicit `tls=x-direct-sni-alpn`, uses the custom dialer directly (no race)
- On other ports, connects normally (plain TCP)

Standard URLs work without BNNA-specific params:
```
mysql://user:pass@tls-host:443/db
```

For explicit control (skip the race):
```
mysql://user:pass@tls-host:443/db?tls=x-direct-sni-alpn
```

For internal connections (172.x or 10.x on port 13306), no TLS or ALPN is
needed — tcpfwd delivers plain MySQL.

## Troubleshooting

### sclient gets EOF

The TLS Router doesn't have a route for the ALPN you specified. Check
that `dynamic-config.go` in the tlsrouter repo has the ALPN in its
`terminatedPortMap`. Also verify `tcpfwd` is running on the backend
host for the corresponding terminated port (e.g. `tcpfwd 13306:<ip>:3306`).

### sclient hangs (no EOF, no error)

The TLS Router connected but the backend isn't responding. Either:
- The ALPN route forwards to a port nobody is listening on
- The backend is waiting for a TLS handshake it won't get

### "require_secure_transport" error

`require_secure_transport = ON` is set in `/etc/my.cnf.d/mariadb-server.cnf`.
This should be OFF for hosts behind the TLS Router (which handles encryption).
Fix: `sudo mariadb -e "SET GLOBAL require_secure_transport = OFF;"` and
update the config file.
