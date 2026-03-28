---
name: proxmox-dns
description:
  DNS record management for Proxmox VMs using domainpanel. Use when mapping domains
  to VMs, creating direct-IP CNAMEs, setting up A+SRV for apex domains, or listing
  existing records. Covers domainpanel CLI, record type selection, and TLS router integration.
---

## Prerequisites

MUST: Run `proxmox-sh-doctor` first (see `proxmox` index skill) to confirm the
`DIRECT_IP_DOMAIN` value and list running VMs with their IPs.

MUST: Ensure domainpanel is configured with the appropriate registrar/DNS accounts.
Check `~/Agents/domainpanel/config.tsv` for configured accounts.

## Direct-IP Domain Pattern

Every Proxmox VM IP maps to two DNS-resolvable domains automatically:

```
IP 10.11.4.209 -> tls-10-11-4-209.<DIRECT_IP_DOMAIN>   (HTTPS proxy to port 3080)
IP 10.11.4.209 -> tcp-10-11-4-209.<DIRECT_IP_DOMAIN>   (raw TCP proxy to port 443)
```

- `tls-` prefix: TLS-terminated HTTP, proxied to port 3080 with `X-Forwarded-*` headers
- `tcp-` prefix: Raw TLS passthrough to port 443

`DIRECT_IP_DOMAIN` comes from the active proxmox-sh env profile (e.g., `vms.paperos.net`).

## Workflow: Map a Domain to a VM

### Step 1: Compute the direct-IP domain

Convert the VM's IP to a direct-IP domain:

```sh
# IP: 10.11.4.209
# Direct-IP: tls-10-11-4-209.vms.paperos.net
```

Formula: replace dots with dashes, prepend `tls-`, append `.<DIRECT_IP_DOMAIN>`.

### Step 2: Choose record type

| Scenario | Record type | When to use |
|----------|-------------|-------------|
| Subdomain | CNAME | `app.example.com` -> direct-IP domain |
| Apex domain | A + SRV | `example.com` (cannot use CNAME at apex) |
| Raw TCP | CNAME to `tcp-` | Direct TLS passthrough (port 443) |

### Step 3: Create records with domainpanel

**CNAME for subdomains (most common):**

```sh
cd ~/Agents/domainpanel

# Create CNAME pointing to the direct-IP domain
go run ./cmd/domainpanel/ -create-host app.example.com \
    -type CNAME \
    -data tls-10-11-4-209.vms.paperos.net

# For SSO subdomain (convention: foo -> foo-sso)
go run ./cmd/domainpanel/ -create-host app-sso.example.com \
    -type CNAME \
    -data tls-10-11-4-209.vms.paperos.net
```

**A + SRV for apex domains:**

Apex domains cannot use CNAME. Use A record for the IP plus SRV for service routing:

```sh
cd ~/Agents/domainpanel

# A record with the VM's actual IP
go run ./cmd/domainpanel/ -create-host example.com \
    -type A \
    -data 10.11.4.209

# SRV record for HTTP routing via TLS router
# Target MUST be a direct-IP domain the TLS router trusts
go run ./cmd/domainpanel/ -create-host _http._tcp.example.com \
    -type SRV \
    -data "10 1 3080 tls-10-11-4-209.vms.paperos.net"
```

**Critical:** SRV targets must be direct-IP domains the TLS router is configured
to trust. Currently trusted: `*.vms.paperos.net`.

### Step 4: Verify

```sh
cd ~/Agents/domainpanel

# List records for the zone
go run ./cmd/domainpanel/ -records -tsv | grep example.com

# Or check via dig
dig +short CNAME app.example.com
dig +short A example.com
```

## domainpanel CLI Reference

All commands run from `~/Agents/domainpanel/`:

```sh
# List all DNS records
go run ./cmd/domainpanel/ -records

# List as TSV (machine-parseable)
go run ./cmd/domainpanel/ -records -tsv

# Create a record
go run ./cmd/domainpanel/ -create-host <FQDN> -type <TYPE> -data <VALUE> [-ttl <SECONDS>]

# Create or update a record
go run ./cmd/domainpanel/ -update-host <FQDN> -type <TYPE> -data <VALUE> [-ttl <SECONDS>]

# Update when multiple records of same type exist
go run ./cmd/domainpanel/ -update-host <FQDN> -type <TYPE> -data <NEW> -match-data <OLD>

# Delete a record
go run ./cmd/domainpanel/ -delete-host <FQDN> [-type <TYPE>]
# -type ALL deletes all record types

# Bulk import from file
go run ./cmd/domainpanel/ -import records.tsv [-dry-run]
```

Default TTL: 300 seconds. Default type: A.

## SRV Record Format

SRV data is a single string: `<priority> <weight> <port> <target>`

```sh
go run ./cmd/domainpanel/ -create-host _http._tcp.app.example.com \
    -type SRV \
    -data "10 1 3080 tls-10-11-4-209.vms.paperos.net"
```

Common service names:

| Service | Name | Port | Notes |
|---------|------|------|-------|
| HTTP | `_http._tcp` | 3080 | Caddy proxy (most common) |
| Raw TLS | `_http._tcp` | 443 | Direct TLS passthrough |
| H2 | `_h2._tcp` | 443 | HTTP/2 direct |
| SSH | `_ssh._tcp` | 22 | SSH access |
| PostgreSQL | `_postgresql._tcp` | 15432 | Database |
| MQTT | `_mqtt._tcp` | 11883 | Message broker |

## Zone Discovery

domainpanel infers the zone from the FQDN and configured accounts. You do not
specify zones separately — just use the full hostname:

```sh
# domainpanel figures out that example.com is the zone
go run ./cmd/domainpanel/ -create-host app.example.com -type A -data 1.2.3.4
```

If the zone is not managed by any configured account, the command will error.

## Updating and Deleting Records

```sh
# Update an existing record (creates if missing)
go run ./cmd/domainpanel/ -update-host app.example.com -type CNAME \
    -data tls-10-11-8-50.vms.paperos.net

# When multiple records of the same type exist, use -match-data
go run ./cmd/domainpanel/ -update-host app.example.com -type A \
    -data 10.11.8.50 -match-data 10.11.4.209

# Delete
go run ./cmd/domainpanel/ -delete-host app.example.com -type CNAME
```

Note: `libdns SetRecords` replaces the entire RRset for `(name, type)`. Use
`-match-data` for targeted single-record updates.

## DNS Health Check

After creating records, use dnscheck to validate:

```sh
cd ~/Agents/domainpanel

# Export current records
go run ./cmd/domainpanel/ -records -tsv > records.tsv

# Run health checks (SPF, DMARC, MX, CAA, dangling CNAMEs)
go run ./cmd/dnscheck/

# Preview auto-fixes
go run ./cmd/dnscheck/ -fix --dry-run
```

## Related Skills

- `proxmox-create-vm` — Create VMs (do this before DNS)
- `proxmox` — Index skill with doctor script (run first)
