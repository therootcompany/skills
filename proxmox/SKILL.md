---
name: proxmox
description:
  Proxmox VM/LXC management index skill. Use when creating VMs, listing containers,
  managing Proxmox environments, or any Proxmox-related task. Load this first - it
  runs the doctor script and points to focused sub-skills.
---

## MUST: Run Doctor First

MUST: Run `proxmox-sh-doctor` before any Proxmox operation. It validates dependencies,
env files, API connectivity, and token permissions.

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-doctor
```

If it fails, fix the errors before proceeding.

Then run `proxmox-sh-resources` to list infrastructure (pools, storages, VMs,
SDN zones, nodes, templates). This output gives the agent everything it needs
to make informed decisions in subsequent steps.

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources
```

## Sub-skills

| Skill | When to use |
|-------|-------------|
| `proxmox-create-vm` | Creating new LXC containers with proxmox-create |
| `proxmox-dns` | DNS record management for VMs (uses domainpanel) |

## Environment Profiles

Profiles live in `~/.config/proxmox-sh/*.env`. Switch with:

```sh
env-switch proxmox-sh <profile-name>
```

This symlinks `current.env` to the selected profile. All proxmox-sh tools read from `current.env`.

MUST: Ask the user which profile to use before running any Proxmox command.

## Key Concepts

### Direct-IP Domains

Each VM IP maps to a DNS-resolvable domain automatically:

```
IP 10.11.4.209 -> tls-10-11-4-209.<DIRECT_IP_DOMAIN>  (HTTPS proxy to port 3080)
IP 10.11.4.209 -> tcp-10-11-4-209.<DIRECT_IP_DOMAIN>  (raw TCP proxy to port 443)
```

`DIRECT_IP_DOMAIN` comes from the active env profile (e.g. `vms.paperos.net`, `vms.coolaj86.com`).

### VMID Scheme

VMIDs are `<PREFIX><3-digit-index>`: prefix `1104` + index `209` = VMID `1104209`, IP `10.11.4.209`.

### Pool Conventions

Look for these pool name patterns in the doctor output:

| Pattern | Purpose |
|---------|---------|
| `*-active` | Running production/dev workloads |
| `*-dev` | Development instances |
| `*-prod` | Production instances |
| `*-offline` | Stopped/archived containers |

### Required ENV Variables

| Variable | Purpose |
|----------|---------|
| `PROXMOX_HOST` | API endpoint (host:port or domain) |
| `PROXMOX_TOKEN_ID` | API token identity |
| `PROXMOX_TOKEN_SECRET` | API token secret |
| `PROXMOX_TARGET_NODE` | Default node for operations |
| `PROXMOX_ID_PREFIX` | VMID prefix (determines IP subnet) |
| `PROXMOX_RESOURCE_POOL` | Pool for new VMs |
| `PROXMOX_VNET` or `PROXMOX_BRIDGE` | Network attachment |
| `PROXMOX_TEMPLATE_STORAGE` | Storage containing OS templates |
| `PROXMOX_TEMPLATE_DEFAULT` | Default OS template |
| `DIRECT_IP_DOMAIN` | Domain suffix for direct-IP access |

## proxmox-sh Tools

Installed at `~/.local/opt/proxmox-sh/`, tools in `bin/`:

| Command | Purpose |
|---------|---------|
| `proxmox-create` | Create LXC containers (interactive - user must run) |
| `env-switch` | Switch active environment profile |
| `proxmox-sh-init` | Initialize config dirs and example files |
| `proxmox-sh-update` | Git pull latest proxmox-sh |
| `caddy-add` | Add reverse proxy routes via Caddy API |

## References

MUST: Read `references/minimum-permissions.csv` when troubleshooting 403 errors,
setting up new tokens, or advising on what a tenant token can and cannot do.

## Related Skills

- `paperos-new-instance-provision-vps-proxmox-cloudflare` - PaperOS-specific provisioning workflow (reference)
- `paperos-new-instance-deploy-services` - Deploying services after VM creation
- `paperos-new-team-member-onboarding-ssh` - SSH access setup
