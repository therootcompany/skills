---
name: connect-to-sqlserver
description: >
  Connect to SQL Server from a dev machine. Use when setting up SSH tunnels,
  testing queries, or configuring Go DSNs for SQL Server instances behind TLS
  proxies or private networks.
---

## Connection Patterns

SQL Server instances in the BNNA cluster sit behind a TLS Router (SNI+ALPN).
There are two ways to connect from a dev machine, depending on what's configured.

### What the LOCAL.md URLs look like

```
# External (via sclient + SSH tunnel)
sqlserver://sa:<pass>@localhost:21433?database=todos

# Internal (plain TDS on :11433, via tcpfwd to :1433)
sqlserver://sa:<pass>@<ct-ip>:11433?database=todos
```

### Server architecture

```
TLS Router (:443) --[ssh ALPN]--> SSH --> local tunnel --> <ct-ip>:11433 (tcpfwd) --> :1433 (SQL Server)
```

- **1433** — SQL Server's actual listener
- **11433** — `tcpfwd 11433:<ct-ip>:1433` — plain TCP forwarder so SQL Server sees
  connections from the CT's own IP instead of localhost

Note: `mssql` ALPN is not yet in the TLS Router. When added, direct sclient or
direct driver access (Option 3) will become available without the SSH tunnel.

---

### Option 1: sclient + SSH tunnel (recommended)

Use sclient as SSH ProxyCommand to reach the SQL Server CT, then forward to its
local port 1433 (plain TDS):

```sh
ssh -o ProxyCommand='sclient --alpn ssh %h' -fnNT \
    -L 21433:localhost:1433 \
    tls-<ip-dashes>.a.bnna.net

sqlcmd -S localhost,21433 -U sa -P '<password>' -d todos
```

Go DSN: `sqlserver://sa:<pass>@localhost:21433?database=todos`

For persistent use, add an SSH config block:

```ssh-config
Host sqlserver-bnna tls-<ip-dashes>.a.bnna.net
    Hostname tls-<ip-dashes>.a.bnna.net
    ProxyCommand sclient --alpn ssh %h
    LocalForward 21433 localhost:1433
```

Then `ssh -fnNT sqlserver-bnna` to start the tunnel.

**How it works:** sclient tunnels SSH (ALPN=ssh) through the TLS Router.
SSH forwards to localhost:1433, which is plain TDS. No TLS at the TDS layer —
the SSH tunnel provides encryption.

```sh
# VERIFY: must return 1
sqlcmd -S localhost,21433 -U sa -P '<password>' -Q "SELECT 1 AS ok"
```

**Cleanup:**
```sh
kill $(pgrep -f 'ssh.*21433.*tls-') 2>/dev/null
```

---

### Option 2: SSH through Proxmox node (fallback)

If you don't have SSH access to the SQL Server CT, tunnel through a Proxmox
node on the same network:

```sh
ssh -o ConnectTimeout=5 -fnNT \
    -L 21433:<ct-ip>:11433 \
    bn1.pvec-slc1.a.bnna.net

sqlcmd -S localhost,21433 -U sa -P '<password>' -d todos
```

Go DSN: `sqlserver://sa:<pass>@localhost:21433?database=todos`

This reaches `tcpfwd` on port 11433, which forwards to SQL Server on port 1433.
No TLS at the TDS layer — SSH tunnel provides encryption.

---

### Option 3: Direct sclient (future — mssql ALPN not yet in TLS Router)

Once `mssql` is added to the TLS Router's `terminatedPortMap: "mssql": 11433`:

```sh
sclient --alpn mssql tls-<ip-dashes>.a.bnna.net:443 localhost:21433

sqlcmd -S localhost,21433 -U sa -P '<password>' -d todos
```

This eliminates the SSH tunnel. TLS Router terminates TLS, forwards plain TDS
to tcpfwd (11433), which forwards to SQL Server (1433).

For direct driver access without sclient, the TLS Router would also need
`rawPortMap: "mssql": 1433`, and SQL Server would need TLS configured with
`Encrypt=Strict` on both client and server.

---

## Go DSN Format

The `github.com/microsoft/go-mssqldb` driver uses URL format:

```
sqlserver://<user>:<password>@<host>:<port>?database=<dbname>
```

All three connection methods above deliver plain TDS to the driver, so no
special encryption flags are needed in the DSN:

```go
db, err := sql.Open("sqlserver",
    "sqlserver://myuser:mypass@localhost:21433?database=mydb")
```

Driver handles `DATETIME2` → `time.Time` natively. No `multiStatements` equivalent
is required — SQL Server handles multiple statements via batches (`GO` separator in
sqlcmd; `context.Background()` in Go).

---

## sqlcmd Syntax Reference

```sh
# Note: comma between host and port, NOT a colon
sqlcmd -S <host>,<port> -U <user> -P '<password>' -d <dbname> -Q "<query>"

# Run from file
sqlcmd -S localhost,21433 -U sa -P '<pass>' -d mydb -i script.sql

# Interactive
sqlcmd -S localhost,21433 -U sa -P '<pass>'
```

---

## Troubleshooting

### "Login failed for user"

- Wrong password — double-check with single quotes around password in shell
- SA account disabled — unlikely for a fresh install, but check:
  `SELECT is_disabled FROM sys.server_principals WHERE name = 'sa'`

### sqlcmd hangs / no connection

- Tunnel not started — check `ss -tlnp | grep 21433` on dev machine
- tcpfwd not running on backend — `ss -tlnp | grep 11433` on the CT
- SQL Server not running — `sudo systemctl status mssql-server` on the CT

### sclient gets EOF

The TLS Router doesn't have a route for the ALPN `mssql`. Either add `mssql` to
`terminatedPortMap` in the tlsrouter config (requires a tlsrouter code change), or
use the SSH tunnel options instead.

### go-mssqldb "TLS handshake failed"

If SQL Server has `forceencryption=1` set but the driver is sending plain TDS,
either unset `forceencryption` on the server or add `encrypt=true` to the DSN.
When connecting through an SSH tunnel, keep `forceencryption=0` on the server —
the tunnel provides transport security.
