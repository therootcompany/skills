---
name: proxmox
description:
  Proxmox VM/LXC management index skill. Use when creating VMs, listing containers,
  managing Proxmox environments, or any Proxmox-related task. Load this first - it
  runs the doctor script and points to focused sub-skills.
---

## Startup (run in order)

### 1. Doctor

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-doctor
```

If it fails: the user only needs to provide 4 values to get started:

1. `PROXMOX_HOST` -- API endpoint (from their admin)
2. `PROXMOX_TOKEN_ID` -- token identity (from their admin)
3. `PROXMOX_TOKEN_SECRET` -- token secret (from their admin)
4. `DIRECT_IP_DOMAIN` -- direct-IP domain suffix (from their admin)

Everything else can be discovered. Create a minimal env file with these 4,
then run env-defaults to fill in the rest:

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-env-defaults --env <file>
```

It queries the API and prints `SUGGEST` lines for every missing variable
(node, pool, vnet, template storage, default template, ID prefix).
See `~/.local/opt/proxmox-sh/example.proxmox-sh.env` for the full field list.

### 2. Scan all tokens

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources-all
```

Individual profile failures are fine. Output shows each token's pools,
storages, VMs, SDN zones, node grants.

For a single profile: `sh .../proxmox-sh-resources [--detail] [--env <file>]`
`--detail` adds node CPU/memory, vnet details, pool member counts, templates.

### 3. Confirm account

Ask which profile to use. Skip if the user already stated a preference.

```sh
env-switch proxmox-sh <profile-name>
```

## Rules

- **Respect token permissions.** Advise when permissions are lacking. Investigate
  before concluding (pool propagation, node vs VM scope). Never bypass.
  MUST read `references/minimum-permissions.csv` on 403 errors, new token
  setup, or when advising what a token can/cannot do.
- **Agent runs all scripts.** Only escalate to the user on actual roadblocks.
- **MUST pass `--os vztmpl/...`** to `proxmox-create` (required in current version).
- **MUST get explicit permission** before touching `~/.ssh/config`.

## VM Pre-flight

**OS selection:** systemd => Ubuntu, OpenRC/minimal => Alpine.
Flavor preference: user's own template > `bnna` variant > default.

**SSH config:** Check before creating a VM:

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-ssh-check
```

If missing, it prints the entry to add. MUST get explicit permission before
touching `~/.ssh/config`. Ask if they also want a friendly CNAME
(e.g. `feat-foo.example.com` -> `tls-10-11-xx-yy.<DIRECT_IP_DOMAIN>`).
If CNAME, also add a host-specific SSH entry:

```
Host feat-foo.example.com
    Hostname tls-10-11-xx-yy.<DIRECT_IP_DOMAIN>
    ProxyCommand sclient --alpn ssh %h
```

**proxmox-create** writes to `/dev/tty` which fails without a terminal.
Wrap with expect: `expect -c 'spawn proxmox-create ...; expect eof'`
See `proxmox-create-vm` sub-skill for flags, sizing, VMID/IP scheme.

## Quick Reference

**Direct-IP domains:** `tls-10-11-4-209.<DIRECT_IP_DOMAIN>` (HTTPS:3080),
`tcp-10-11-4-209.<DIRECT_IP_DOMAIN>` (TCP:443).

**VMID scheme:** `<PREFIX><3-digit-index>` -- prefix `1104` + index `209` =
VMID `1104209`, IP `10.11.4.209`.

**Pool conventions:** `*-active`, `*-dev`, `*-prod`, `*-offline`.

## Sub-skills

| Skill | When |
|-------|------|
| `proxmox-create-vm` | Creating LXC containers |
| `proxmox-dns` | DNS record management (domainpanel) |

## proxmox-sh Tools

Installed at `~/.local/opt/proxmox-sh/`, commands in `bin/`:

| Command | Purpose |
|---------|---------|
| `proxmox-create` | Create LXC containers |
| `env-switch` | Switch active environment profile |
| `proxmox-sh-init` | Initialize config dirs and example env |
| `proxmox-sh-update` | Git pull latest proxmox-sh |
| `caddy-add` | Add reverse proxy routes via Caddy API |
