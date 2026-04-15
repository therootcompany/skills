---
name: bnna-deploy-customer-app
description: Deploy Go binaries and services to BNNA customer VMs. Use when deploying audit tools, report servers, or any Go service to a Linux VM behind a TLS router. Covers directory layout (~/bin, ~/srv, ~/.config), cross-compilation, scp deploy, systemd services, cron, and PowerShell script deployment to Windows servers via SSH.
---

<!-- core -->

## Critical Rules

- MUST: Deploy binaries to `~/bin/` as the service user (e.g. `app`), not `/opt/` or `/usr/local/`.
- MUST: Store application data and services in `~/srv/<app-name>/`.
- MUST: Store secrets and config in `~/.config/<app-name>/` (POSIX .env format).
- MUST: Source `~/.config/envman/PATH.env` before running deployed binaries — `webi`-installed tools (sclient, etc.) are only on PATH after sourcing.
- MUST: Use `sudo -u <user> bash -l -c "..."` when running commands as the service user from root — this loads the login profile including PATH.
- MUST: Stop running services before overwriting binaries — scp fails on locked files.
- MUST: Use forward slashes in scp paths when targeting Windows OpenSSH — backslashes and globs don't work.
- NEVER: Deploy as root to root-owned directories. The service user owns everything.
- NEVER: Put secrets in environment variables or command-line args visible in `ps`. Use .env files loaded by the application.

<!-- /core -->

## Directory Layout

All paths are relative to the service user's home (e.g. `/home/app/`):

| Path | Purpose | Example |
|------|---------|---------|
| `~/bin/` | Executable binaries | `audit-runner`, `report-server` |
| `~/srv/<app>/` | Application data, scripts, output | `srv/audit/scripts/`, `srv/audit/output/` |
| `~/.config/<app>/` | Secrets, .env config files | `.config/audit/audit.env` |

The service user's PATH includes `~/bin/` via envman. Binaries placed there are immediately available.

## Cross-Compile and Deploy

```sh
# 1. Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o <app>-linux ./path/to/cmd/<app>/

# 2. Stop the service if running (binary is locked while running)
ssh <vm-host> "systemctl stop <service-name> || true"

# 3. Upload to temp location (scp can't overwrite files owned by other users)
scp <app>-linux root@<vm-host>:/tmp/<app>-new

# 4. Move into place with correct ownership
ssh root@<vm-host> 'mv /tmp/<app>-new /home/<user>/bin/<app> && chown <user>:<user> /home/<user>/bin/<app> && chmod 755 /home/<user>/bin/<app>'

# 5. Restart the service
ssh <vm-host> "systemctl start <service-name>"

# VERIFY:
ssh <vm-host> "sudo -u <user> bash -l -c '<app> --help'"
```

## SSH Access Pattern (BNNA TLS Router)

VMs sit behind a TLS router using ALPN-based service multiplexing on port 443.

```sh
# SSH to VM as root
ssh -o ProxyCommand="sclient --alpn ssh %h:443" -o User=root <vm-hostname>

# Run command as service user (loads login profile for PATH)
ssh -o ProxyCommand="sclient --alpn ssh %h:443" -o User=root <vm-hostname> \
  'sudo -u <user> bash -l -c "<command>"'
```

The `sclient --alpn ssh %h:443` ProxyCommand connects via the TLS router's SSH ALPN endpoint.

## PowerShell Script Deployment (Windows Targets)

When deploying scripts to Windows servers accessed via SSH:

1. **Copy scripts** to a temp directory under the user's home (e.g. `%USERPROFILE%\<job>\scripts\`)
2. **Run scripts** using `-EncodedCommand` (base64 UTF-16LE) to avoid cmd.exe quoting issues
3. **Pull results** by listing remote files via SSH, then scp each individually (no glob)
4. **Clean up** the temp directory on the Windows server after pulling results

### Windows SSH Gotchas

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `|` and `>` break in commands | cmd.exe is the default SSH shell, intercepts pipes | Use `-EncodedCommand` (base64 UTF-16LE) |
| scp `\*` glob doesn't expand | cmd.exe doesn't do glob expansion | List files via SSH, scp each individually |
| scp `-r` prepends `/` to paths | Protocol quirk with Windows paths | Don't use `-r`; copy files one at a time |
| scp upload with forward slashes fails | Upload needs backslash paths | Keep native `\` for CopyTo |
| scp download with backslash paths fails | Download needs forward slashes | Convert `\` to `/` for CopyFrom |

### EncodedCommand Pattern (Go)

```go
// Convert PowerShell command to base64 UTF-16LE
func encodePS(psCmd string) string {
    runes := utf16.Encode([]rune(psCmd))
    buf := make([]byte, len(runes)*2)
    for i, r := range runes {
        binary.LittleEndian.PutUint16(buf[i*2:], r)
    }
    return base64.StdEncoding.EncodeToString(buf)
}
// Then: ssh ... powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -EncodedCommand <encoded>
```

## Config File Format

POSIX `.env` loaded with `godotenv`:

```sh
# ~/.config/<app>/<app>.env

# SSH targets
TARGET_HOST=tls-10-11-6-2.a.bnna.net
TARGET_USER=username
TARGET_PROXY=sclient --alpn ssh %h:443

# Postgres (behind TLS router, SSL disabled)
PG_URL=postgres://user:pass@localhost:15432/dbname?sslmode=disable

# API keys (leave empty to skip AI features)
ANTHROPIC_API_KEY=
```

## Systemd Service

```sh
# Create service file
cat > /etc/systemd/system/<service>.service << 'EOF'
[Unit]
Description=<Service Description>
After=network.target

[Service]
Type=simple
User=<user>
ExecStart=/home/<user>/bin/<binary> --config /home/<user>/.config/<app>/<app>.env
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable <service>
systemctl start <service>

# VERIFY:
systemctl status <service> --no-pager | head -5
```

## Cron Jobs

```sh
# /etc/cron.d/<app>
# Full run daily at 06:00 UTC
0 6 * * * <user> bash -l -c "/home/<user>/bin/<binary> --config /home/<user>/.config/<app>/<app>.env --mode full >> /home/<user>/srv/<app>/cron.log 2>&1"

# Delta check every 4 hours
0 */4 * * * <user> bash -l -c "/home/<user>/bin/<binary> --config /home/<user>/.config/<app>/<app>.env --mode delta >> /home/<user>/srv/<app>/cron.log 2>&1"
```

MUST: Use `bash -l -c` in cron entries — cron doesn't load the user's login profile, so `sclient` and other webi-installed tools won't be on PATH.

## Related Skills

- `bnna-postgres` — PostgreSQL setup on the same VM
- `proxmox` — VM provisioning
- `proxmox-dns` — DNS mapping for the VM
