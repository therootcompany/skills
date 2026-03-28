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

If it fails: read the example env for expected fields
(`cat ~/.local/opt/proxmox-sh/example.proxmox-sh.env`), help the user fix
their profile. If no working token exists, stop and explain what they need.

### 2. Scan all tokens

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources-all
```

Individual profile failures are fine. Output shows each token's pools,
storages, VMs, SDN zones, node grants.

For a single profile: `sh .../proxmox-sh-resources [--detail] [--env <file>]`

### 3. Confirm account

Ask which profile to use. Skip if the user already stated a preference.

```sh
env-switch proxmox-sh <profile-name>
```

## Rules

- **Respect token permissions.** Advise when permissions are lacking. Investigate
  before concluding (pool propagation, node vs VM scope). Never bypass.
  See `references/minimum-permissions.csv` for what each operation requires.
- **Agent runs all scripts.** Only escalate to the user on actual roadblocks.
- **MUST pass `--os vztmpl/...`** to `proxmox-create` (required in current version).
- **MUST get explicit permission** before touching `~/.ssh/config`.

## VM Pre-flight

**OS selection:** systemd => Ubuntu, OpenRC/minimal => Alpine.
Flavor preference: user's own template > `bnna` variant > default.

**SSH config:** User needs a wildcard entry before SSH works:

```
Host *.<DIRECT_IP_DOMAIN>
    ProxyCommand sclient --alpn ssh %h
```

Ask if they want a friendly CNAME (e.g. `feat-foo.example.com`) pointing to
the direct-IP domain, or if `tls-10-11-xx-yy.<DIRECT_IP_DOMAIN>` is enough.
If CNAME, add a host-specific SSH entry too.

**proxmox-create** forces tty output -- handle or work around it.
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

In `~/.local/opt/proxmox-sh/bin/`: `proxmox-create`, `env-switch`,
`proxmox-sh-init`, `proxmox-sh-update`, `caddy-add`.
