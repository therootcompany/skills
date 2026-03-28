---
name: proxmox-create-vm
description:
  Create LXC containers on Proxmox with proxmox-create. Use when provisioning new VMs,
  choosing sizing, or understanding VMID/IP assignment. Covers CLI flags, env vars,
  interactive workflow, and post-creation verification.
---

## Prerequisites

MUST: Run `proxmox-sh-doctor` first (see `proxmox` index skill). It validates the
environment and lists available templates, pools, and nodes.

MUST: Ask the user which env profile to use before any operation.

## Creating an LXC Container

### Step 1: Read defaults from the active env

```sh
grep -E 'PROXMOX_TEMPLATE_DEFAULT|PROXMOX_TARGET_NODE|PROXMOX_ID_PREFIX' \
    ~/.config/proxmox-sh/current.env
```

Use `PROXMOX_TEMPLATE_DEFAULT` verbatim as the `--os` value.

### Step 2: Build the command

MUST: Always specify `--os`, `--storage`, `--ram`, and `--vcpus` explicitly.
NEVER: Rely on defaults for any of these flags.

```sh
proxmox-create <hostname> \
    --os <PROXMOX_TEMPLATE_DEFAULT value> \
    --storage <gb> \
    --ram <mb> \
    --vcpus <n>
```

### Step 3: User runs the command

`proxmox-create` requires an interactive terminal (tty confirmation). The agent
cannot run this directly. Tell the user the exact command and have them run it
with the `!` prefix:

```
! proxmox-create myhost --os vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst --storage 10 --ram 2048 --vcpus 2
```

After creation, the output shows the assigned CTID, IP, and direct-IP domains.
Record these for DNS setup (see `proxmox-dns` skill).

### Step 4: Verify the container

```sh
# Source env for API access
. ~/.config/proxmox-sh/current.env

# Check container status via API
curl --max-time 10 --fail-with-body -sSL \
    -H "Authorization: PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}" \
    "https://${PROXMOX_HOST}/api2/json/nodes/${PROXMOX_TARGET_NODE}/lxc/<VMID>/status/current" | jq '.data.status'
```

## CLI Reference

```
proxmox-create <hostname> [ssh-pubkey-file-url-or-string]
```

| Flag | Required | Values | Description |
|------|----------|--------|-------------|
| `--os` | YES | Template path or shortname | OS template (use `PROXMOX_TEMPLATE_DEFAULT`) |
| `--storage` | YES | `1-250` GB | Data disk at `/mnt/storage` |
| `--ram` | YES | `64-24576` MB | RAM allocation |
| `--vcpus` | YES | `1-12` | vCPU cores |
| `--target-node` | no | `pve1`, `pve2`, `pve3`, `pve4` | Override `PROXMOX_TARGET_NODE` |
| `--vcpu-limit` | no | `<= vcpus` | Max vCPU usage limit |

### OS Shortnames

| Shortname | Template |
|-----------|----------|
| `alpine`, `alpine20` | `alpine-3.20-bnna_*.tar.zst` |
| `alpine19` | `alpine-3.19-bnna_*.tar.zst` |
| `alpine18` | `alpine-3.18-bnna_*.tar.zst` |
| `alpine17` | `alpine-3.17-bnna_*.tar.zst` |
| `ubuntu`, `ubuntu24` | `ubuntu-24.04-standard_*.tar.zst` |
| `ubuntu22` | `ubuntu-22.04-standard_*.tar.zst` |
| `ubuntu20` | `ubuntu-20.04-standard_*.tar.gz` |
| `vztmpl/...` | Full template path (custom templates) |

Prefer the full `vztmpl/` path from `PROXMOX_TEMPLATE_DEFAULT` over shortnames,
especially for custom templates that don't match the built-in shortname list.

## Standard Sizing

| Tier | RAM | vCPU | Storage | Use case |
|------|-----|------|---------|----------|
| Minimal | 512 MB | 1 | 1 GB | Static sites, simple services |
| Dev | 2048 MB | 2 | 10 GB | Development instances |
| Standard | 4096 MB | 2 | 20 GB | Production services |
| Heavy | 8192 MB | 4 | 50 GB | Databases, build servers |

## VMID and IP Assignment

VMIDs are auto-assigned: `<PROXMOX_ID_PREFIX><3-digit-index>`.

The index maps directly to the last IP octet:

```
Prefix: 1104, Next index: 209
VMID:   1104209
IP:     10.11.4.209/24
GW:     10.11.4.1
MAC:    00:52:11:04:02:09
```

The tool finds the next available index by querying all existing resources
with the same prefix.

## Container Layout

Each container gets:

| Mount | Pool | Purpose |
|-------|------|---------|
| `/` (rootfs) | `PROXMOX_FS_POOL` | 8 GB system disk (fixed) |
| `/mnt/storage` | `PROXMOX_DATA_POOL` | Data disk (`--storage` size) |

Mount options: `discard;lazytime;noatime` (rootfs), `discard;lazytime;noatime;nodev;nosuid` (data).

## Post-Creation

After the container is created and running:

1. **TLS certificate** — `proxmox-create` initiates ACME issuance automatically
2. **DNS** — Set up friendly domains (see `proxmox-dns` skill)
3. **SSH access** — `ssh tls-<ip-dashes>.<DIRECT_IP_DOMAIN>` (requires `sclient --alpn ssh` ProxyCommand)
4. **Deploy services** — See `paperos-new-instance-deploy-services` skill if deploying PaperOS

## Required ENV Variables

All loaded from `~/.config/proxmox-sh/current.env`:

| Variable | Purpose |
|----------|---------|
| `PROXMOX_HOST` | API endpoint |
| `PROXMOX_TOKEN_ID` | API token identity |
| `PROXMOX_TOKEN_SECRET` | API token secret |
| `PROXMOX_TARGET_NODE` | Default node |
| `PROXMOX_ID_PREFIX` | VMID prefix (determines subnet) |
| `PROXMOX_RESOURCE_POOL` | Pool for new VMs |
| `PROXMOX_VNET` or `PROXMOX_BRIDGE` | Network attachment (mutually exclusive) |
| `PROXMOX_SEARCH_DOMAIN` | DNS search domain |
| `PROXMOX_NAMESERVER` | DNS nameserver |
| `PROXMOX_TEMPLATE_STORAGE` | Storage containing OS templates |
| `PROXMOX_TEMPLATE_DEFAULT` | Default OS template |
| `PROXMOX_FS_POOL` | ZFS pool for rootfs |
| `PROXMOX_DATA_POOL` | ZFS pool for data mount |
| `PROXMOX_AUTHORIZED_KEYS` | Default SSH public keys (file/URL/string) |
| `DIRECT_IP_DOMAIN` | Domain suffix for direct-IP access |
| `PROXMOX_HA_ENABLE` | (optional) Enable HA group assignment |
