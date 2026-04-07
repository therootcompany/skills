---
name: repo-init
description: Agent repo initialization pattern. Use to initialize a repo for Agent assistance. Covers directory structure (AGENTS.md, LOCAL.md, agents/, skills/, docs/), session files, and how to split project knowledge.
---

## Session Start Sequence

1. Read `AGENTS.md` (committed) — architecture, gotchas, pre-commit, skills to load
2. Read `LOCAL.md` (git ignored) if present — environment-specific context for this worktree
3. As needed, load the skills found in ~/Agents/skills, or in the repo
4. Create session files in `./agents/`: `TASKS.md`, `REVIEW.md`, `HANDOFF.md`, and `tmp/` directory

## LOCAL.md

Gitignored, ephemeral, worktree/session-specific. Contains what differs between environments or operators:

- Notes only relevant to this machine/operator
- Paths to specific `.env` files (prod vs dev)
- Config info, base urls, deploy targets - hostname, IP, `DB_URL`, etc
- Agent-specific local env var overrides or flags
- Concrete versions of things that are parameterized or asked for in AGENTS.md or skills

**Create it** at session start if missing and you have environment-specific context to record.
**Never commit it** — add `LOCAL.md` to `.gitignore`.

## AGENTS.md vs LOCAL.md Split

| Put in AGENTS.md                        | Put in LOCAL.md                     |
| --------------------------------------- | ----------------------------------- |
| True for all agents in all environments | True for this machine/operator only |
| Invariants not obvious from code        | Which specific account/env to use   |
| Gotchas that look correct but aren't    | Prod vs dev credential file paths   |
| Pre-commit checklist                    | Deploy target details               |
| Config file names and schemas           | Session-specific overrides          |
| Which skills to load                    | —                                   |

**Leave out of both:** things an agent learns by reading the relevant source file (routes, struct fields, function signatures, test patterns).

## Project skills

Project-specific skills go in `./skills/<prefix>-<name>/SKILL.md` and are committed
to the repo. Every project skill must have a project prefix (e.g. `paperos-`,
`myapp-`) so it's visually distinct from global skills when listed alongside them.

Symlink each into `~/Agents/skills/` so the harness discovers them:

```sh
ln -s ~/path/to/project/skills/myapp-deploy ~/Agents/skills/myapp-deploy
```

### Index skill per repo

When a repo has 3+ skills, create an index in the AGENTS.md Skills section - a table
listing each skill and when to use it. This lets agents decide which skills to load
without reading every SKILL.md body. See the global `~/Agents/skills/AGENTS.md` for
the pattern.

## Project Directory Structure

Standard layout for agent-assisted projects:

```
/AGENTS.md          - Committed project conventions (architecture, gotchas, commands)
/LOCAL.md           - Gitignored, environment-specific context (accounts, env files, deploy targets)
/skills/           - Project-specific skills (e.g. sso-deploy/, sso-db-migrate/)
/docs/              - Design decisions, architecture notes, ADRs (not obvious from code)
/agents/TASKS.md    - Session task tracking (gitignored)
/agents/REVIEW.md   - Questions needing feedback (gitignored)
/agents/HANDOFF.md  - Context for next agent (gitignored)
/agents/tmp/        - Temporary files, clones, scratch work (gitignored)
```

- `LOCAL.md` stays at root for discoverability
- `skills/` at root (not in `agents/`) because skills are committed and shared
- `docs/` for non-obvious context: design rationales, architecture decisions, mental models
- `agents/` directory is ephemeral and gitignored — agents recreate it per session
- For Go projects: `./agents/tmp/` is critical — Go rejects imports from `/tmp` or `/internal`

## .gitignore entries for every project

```
LOCAL.md
agents/TASKS.md
agents/REVIEW.md
agents/HANDOFF.md
agents/ISSUES.md
agents/tmp/
```
