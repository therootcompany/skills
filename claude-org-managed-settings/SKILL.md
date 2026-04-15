---
name: claude-org-managed-settings
description: Claude Code org-wide managed settings — machine-level policy enforced above all project settings. Use when setting up org policy, distributing settings to team machines, or understanding the managed settings scope. Covers platform paths, managed-settings.d drop-ins, CLAUDE.md, symlink distribution, and open unknowns.
---

# Claude Code — Org Managed Settings

Managed settings are the highest-priority scope in Claude Code. They are
machine-level, immutable by users, and apply to every session on that machine
regardless of project.

**Read `~/Agents/docs/claude-settings-json.md`** for the full settings reference.

## Platform paths

| Platform | Managed settings dir |
|----------|----------------------|
| macOS | `/Library/Application Support/ClaudeCode/` |
| Linux | `/etc/claude-code/` |
| Windows | `%PROGRAMDATA%\ClaudeCode\` (e.g. `C:\ProgramData\ClaudeCode\`) |

## What goes in managed settings

Files in the managed dir:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Org-wide instructions, loaded into every session |
| `managed-settings.json` | Single settings file |
| `managed-settings.d/*.json` | Drop-in files, alphabetically merged; arrays concatenated |

Use `managed-settings.d/` for modular policy. Prefix filenames to control
merge order: `10-org.json`, `20-security.json`, `30-permissions.json`.

## Confirmed working fields

```json
{
  "attribution": { "commit": "", "pr": "" },
  "skipDangerousModePermissionPrompt": true,
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(git *)", "Bash(go test *)"],
    "deny": ["Bash(rm -rf /*)", "Bash(dd if=*)"]
  }
}
```

### Managed-only fields

These fields only take effect at managed scope — ignored in project settings:

| Field | Values | Effect |
|-------|--------|--------|
| `disableBypassPermissionsMode` | `"disable"` | Blocks bypass mode entirely |
| `allowManagedHooksOnly` | bool | Only hooks from managed settings fire |
| `allowManagedPermissionRulesOnly` | bool | Only managed allow/deny rules apply |
| `allowManagedMcpServersOnly` | bool | Only managed MCP servers allowed |

### defaultMode values

| Mode | Behavior |
|------|----------|
| `default` | Prompts for most tool use |
| `acceptEdits` | Auto-approves file edits, prompts for shell |
| `auto` | Fully autonomous |
| `bypassPermissions` | Skip all permission checks |

NEVER set `defaultMode: "bypassPermissions"` in managed settings — use
`skipDangerousModePermissionPrompt: true` so users can opt in without a nag prompt.

## Symlink distribution (recommended)

Copy installs go stale. Symlink the managed dir to a live git checkout so
`git pull` in the org repo is the only update step needed:

```sh
# macOS example
ln -s ~/path/to/org-repo/org/AGENTS.md \
    "/Library/Application Support/ClaudeCode/CLAUDE.md"
ln -s ~/path/to/org-repo/org/managed-settings.d \
    "/Library/Application Support/ClaudeCode/managed-settings.d"
```

See `install.sh` pattern in `paperos-labs/claude` (when created).

## What we don't know yet

- **`autoDreamEnabled`** — seen in a settings file, purpose unknown
- **`enabledPlugins`** — seen `gopls-lsp@claude-plugins-official`; plugin system not documented
- **Whether `managed-settings.d/` arrays truly concatenate** with lower-priority scopes or override — needs testing
- **`allowManagedHooksOnly` behavior** — does it silence project hooks entirely or just lower priority?
- **Org repo distribution model** — plan to use `paperos-labs/claude.git` as canonical source; not yet created

## What NOT to put in managed settings

- `defaultMode: "bypassPermissions"` — too broad, applies to everyone always
- `disableBypassPermissionsMode: "disable"` — blocks infra agents and onboarding skills that need sudo/SSH
- Secrets or tokens — managed files may be readable by all users on the machine
- `autoMemoryDirectory` — only effective at user/org scope anyway

## See also

- `~/Agents/docs/claude-settings-json.md` — full settings.json reference
