---
name: proxmox
description:
  Proxmox VM/LXC management index skill. Use when creating VMs, listing containers,
  managing Proxmox environments, or any Proxmox-related task. Load this first - it
  runs the doctor script and points to focused sub-skills.
---

## Startup Sequence

Run these three steps at the start of every Proxmox session, in order.

### Step 1: MUST: Run Doctor

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-doctor
```

If it fails with missing dependencies or broken env, fix the errors before
proceeding. If the user has no working token yet, exit with clear instructions:
what to install (`webi`, `jq`, etc.), how to create a profile
(`proxmox-sh-init`, then edit the example), and how to get a token from their
Proxmox admin.

Read the example env to understand expected fields:

```sh
cat ~/.local/opt/proxmox-sh/example.proxmox-sh.env
```

Use this to help the user create or migrate their profile. Fill in reasonable
defaults from resources output where possible (e.g. pick the first available
pool, storage, vnet from what the token can see).

### Step 2: MUST: Scan All Tokens

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources-all
```

This scans every profile in `~/.config/proxmox-sh/` (skipping `current.env`
and `example.env`). Individual failures are fine as long as the doctor-checked
profile succeeded. The output shows what each token can see: pools, storages,
VMs, SDN zones, node grants.

For a single profile or when using `--env` directly:

```sh
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources            # default: 3 API calls
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources --detail   # full: 8+ API calls
sh ~/Agents/skills/proxmox/scripts/proxmox-sh-resources --env /path/to/file.env
```

`--detail` adds node CPU/memory metrics, vnet details, pool member counts,
and template listing.

### Step 3: MUST: Confirm Account

Ask the user which profile/account to use. If they already stated a clear
preference, proceed without double-confirming. Use `env-switch` if needed:

```sh
env-switch proxmox-sh <profile-name>
```

## MUST: Respect Token Permissions

The token's granted permissions are the guardrails.

- Advise the user when their token lacks permissions for the requested operation.
- If a permission denial surprises you, investigate (e.g. node-level vs VM-level
  scope, pool propagation) before concluding it's missing -- but never bypass or
  ignore what the token cannot do.
- Reference `references/minimum-permissions.csv` for what each operation requires.

## Sub-skills

| Skill | When to use |
|-------|-------------|
| `proxmox-create-vm` | Creating new LXC containers with proxmox-create |
| `proxmox-dns` | DNS record management for VMs (uses domainpanel) |

## Creating a VM: Pre-flight

Before running `proxmox-create`, handle these in order.

### OS Selection

Pick the OS template based on the task:

| Need | OS | Why |
|------|----|-----|
| systemd (most services) | Ubuntu | widest package support |
| OpenRC / minimal | Alpine | smallest footprint |

Flavor preference order: the user's own template if they have one, then `bnna`
variants (e.g. `ubuntu-24.04-bnna`), then the standard/default template.

### SSH Config (MUST get explicit permission)

The user's `~/.ssh/config` needs a wildcard entry for the direct-IP domain
before they can SSH into new VMs. **MUST ask for explicit permission before
touching ~/.ssh/config.**

Wildcard entry for the direct-IP domain:

```
Host *.vms.example.net
    ProxyCommand sclient --alpn ssh %h
```

If the user wants a friendly CNAME (e.g. `feat-more-cowbell.whatever.com`
pointing to `tls-10-11-xx-yy.vms.example.net`), they also need a host-specific
entry:

```
Host feat-more-cowbell.whatever.com
    Hostname tls-10-11-xx-yy.vms.example.net
    ProxyCommand sclient --alpn ssh %h
```

You may offer to create the CNAME entry before or after VM creation.

Ask the user if they want a friendly CNAME on their direct-IP domain, or if
the `tls-10-11-xx-yy` domain is sufficient.

### Running proxmox-create

`proxmox-create` is interactive and forces some output to tty. The user must
run it themselves with the `!` prefix:

```
! proxmox-create ...
```

See the `proxmox-create-vm` sub-skill for flags, sizing tiers, and VMID/IP
assignment.

## Key Concepts

### Direct-IP Domains

Each VM IP maps to a DNS-resolvable domain automatically:

```
IP 10.11.4.209 -> tls-10-11-4-209.<DIRECT_IP_DOMAIN>  (HTTPS proxy to port 3080)
IP 10.11.4.209 -> tcp-10-11-4-209.<DIRECT_IP_DOMAIN>  (raw TCP proxy to port 443)
```

`DIRECT_IP_DOMAIN` comes from the active env profile (e.g. `vms.paperos.net`,
`vms.coolaj86.com`).

### VMID Scheme

VMIDs are `<PREFIX><3-digit-index>`: prefix `1104` + index `209` = VMID
`1104209`, IP `10.11.4.209`.

### Pool Conventions

Look for these pool name patterns in the resources output:

| Pattern | Purpose |
|---------|---------|
| `*-active` | Running production/dev workloads |
| `*-dev` | Development instances |
| `*-prod` | Production instances |
| `*-offline` | Stopped/archived containers |

### ENV Variables

See `~/.local/opt/proxmox-sh/example.proxmox-sh.env` for the full reference
with comments. Key fields:

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
| `PROXMOX_AUTHORIZED_KEYS` | URL, file path, or inline SSH public keys |
| `PROXMOX_FS_POOL` | ZFS/Ceph pool for rootfs |
| `PROXMOX_DATA_POOL` | ZFS/Ceph pool for data storage |

## proxmox-sh Tools

Installed at `~/.local/opt/proxmox-sh/`, tools in `bin/`:

| Command | Purpose |
|---------|---------|
| `proxmox-create` | Create LXC containers (interactive -- user must run) |
| `env-switch` | Switch active environment profile |
| `proxmox-sh-init` | Initialize config dirs and example files |
| `proxmox-sh-update` | Git pull latest proxmox-sh |
| `caddy-add` | Add reverse proxy routes via Caddy API |

## References

MUST: Read `references/minimum-permissions.csv` when troubleshooting 403 errors,
setting up new tokens, or advising on what a tenant token can and cannot do.

## Related Skills

- `paperos-new-instance-provision-vps-proxmox-cloudflare` -- PaperOS-specific provisioning workflow (reference)
- `paperos-new-instance-deploy-services` -- Deploying services after VM creation
- `paperos-new-team-member-onboarding-ssh` -- SSH access setup
