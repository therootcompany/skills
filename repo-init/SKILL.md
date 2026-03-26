---
name: repo-init
description: Agent repo initialization pattern. Use to initialize a repo for Agent assistance. Covers what to read, what LOCAL.md is, and how to split project knowledge between AGENTS.md and LOCAL.md.
---

## Session Start Sequence

1. Read `AGENTS.md` (committed) — architecture, gotchas, pre-commit, skills to load
2. Read `LOCAL.md` (git ignored) if present — environment-specific context for this worktree
3. As needed, load the skills found in ~/Agents/skills, or in the repo
4. Create session files per global AGENTS.md: `TASKS.md`, `REVIEW.md`, `HANDOFF.md`, `SESSION.tmp.d/`

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

## .gitignore entries for every project

```
LOCAL.md
*.tmp
*.tmp.d
tmp
agent-session.tmp.d
```
