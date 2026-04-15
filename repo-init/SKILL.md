---
name: repo-init
description: Initialize a repo for agent-assisted work — directory layout, session files, and how to split project knowledge between AGENTS.md (committed) and LOCAL.md (gitignored). Use at the start of every session in a new or unfamiliar repo, or when setting one up for the first time.
---

## Session start sequence

1. Read `AGENTS.md` (committed) — architecture, gotchas, pre-commit, which skills to load.
2. Read `LOCAL.md` (gitignored) if present — environment-specific context for this worktree.
3. Load the skills called out by `AGENTS.md` (from `~/Agents/skills/` or `./skills/`).
4. Create per-session files in `./agents/`: `TASKS.md`, `REVIEW.md`, `HANDOFF.md`, and `tmp/`.

## Directory layout

```
/AGENTS.md         - Committed: project conventions (architecture, gotchas, commands, skills index)
/LOCAL.md          - Gitignored: env-specific context (accounts, env files, deploy targets)
/skills/           - Committed: project-specific skills (e.g. bnna-deploy/, sso-db-migrate/)
/docs/             - Committed: ADRs, design decisions (not obvious from code)
/agents/TASKS.md   - Gitignored: session task tracking
/agents/REVIEW.md  - Gitignored: questions needing feedback
/agents/HANDOFF.md - Gitignored: context for next agent
/agents/issues.d/  - Gitignored: open issues (see `use-self-healing`)
/agents/tmp/       - Gitignored: scratch work, clones, fixtures
```

- `LOCAL.md` lives at root for discoverability (not under `agents/`).
- `skills/` lives at root because skills are committed and shared.
- `agents/` is ephemeral — recreated per session.
- Go projects: `./agents/tmp/` is **required** — Go rejects imports under `/tmp` or `/internal`.

### `.gitignore`

```
LOCAL.md
agents/TASKS.md
agents/REVIEW.md
agents/HANDOFF.md
agents/issues.d/
agents/tmp/
```

## AGENTS.md vs LOCAL.md

| Put in AGENTS.md (true for everyone)    | Put in LOCAL.md (true for this operator only) |
| --------------------------------------- | --------------------------------------------- |
| Invariants not obvious from code        | Which account / env to use                    |
| Gotchas that look correct but aren't    | Prod vs dev credential paths                  |
| Pre-commit checklist                    | Deploy target hostname, IP, `DB_URL`          |
| Config file names and schemas           | Session-specific env-var overrides            |
| Skills index (which to load when)       | Concrete versions of things AGENTS.md leaves parameterized |

**In neither:** things an agent learns by reading source — routes, struct fields, function signatures, test patterns.

Create `LOCAL.md` at session start if it's missing and you have environment context worth recording. Never commit it.

## Project skills

Project-specific skills live at `./skills/<prefix>-<name>/SKILL.md`, committed to the repo. Every project skill MUST carry a project prefix (`bnna-`, `authd-`, …) so it's visually distinct from global skills when listed alongside them.

For the harness to discover a project skill, symlink it into `~/Agents/skills/`:

```sh
ln -s "$(pwd)/skills/<prefix>-<name>" "$HOME/Agents/skills/<prefix>-<name>"
```

### Skills index in AGENTS.md

Maintain a table in the `AGENTS.md` Skills section: skill name + when to use it. Lets agents pick which skills to load without reading every `SKILL.md` body. See `~/Agents/skills/AGENTS.md` for the pattern.
