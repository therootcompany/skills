# Skills

Each skill is a `SKILL.md` in its own directory. Invoke via the `Skill` tool.

| Skill | When to use |
|-------|-------------|
| `create-skill` | Creating or updating a SKILL.md |
| `git-workflow` | GitHub repo creation, branch protection, committing, PRs, merging |
| `go-develop` | Go HTTP handlers, routes, middleware, migrations, data endpoints, CLI flags |
| `shell-scripting` | Writing or reviewing POSIX shell scripts |
| `sqlc-query-design` | Writing, updating, or debugging sqlc-managed SQL queries in Go projects |
| `strip-ai-tells` | Cleaning up AI-generated text, docs, commit messages, or markdown |
| `use-modern-go` | Applying modern Go syntax guidelines for a project's Go version |
| `write-modern-javascript` | Vanilla JS for browser UIs — no transpiler, no framework |


## Session Start Sequence

1. Whenever a `.git` is present but `AGENTS.md` is missing, ask if the `repo-init` skill should be used.
2. Read `AGENTS.md` (committed) — architecture, gotchas, pre-commit, skills to load
3. Read `LOCAL.md` (git ignored) if present — environment-specific context for this worktree
4. As needed, load the skills found in ~/Agents/skills, or in the repo
5. Create session files per global AGENTS.md: `TASKS.md`, `REVIEW.md`, `HANDOFF.md`, `SESSION.tmp.d/`

## LOCAL.md

Git-ignored, ephemeral, worktree/environment-specific. Contains what differs between environments or operators:

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

## .gitignore entries for every project

```
LOCAL.md
SESSION.md
TASKS.md
*.tmp
*.tmp.d
tmp
```
