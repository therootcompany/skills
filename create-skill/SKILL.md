---
name: create-skill
description: Create a SKILL.md. Triggered when user asks to create a skill, document a pattern, or convert docs into a skill.
---

## Discovery

Ai Agent harnesses discover skills by scanning for `SKILL.md` files in known directories:

| Location | Path | Scope |
|----------|------|-------|
| Global | `~/Agents/skills/<name>/SKILL.md` | All projects |
| Project | `./skills/<name>/SKILL.md` | Current project only |

Project-local skills committed to git go in `./skills/<name>/SKILL.md` and are
symlinked into `~/Agents/skills/` so the harness finds them:

```sh
ln -s ~/path/to/project/skills/my-skill ~/Agents/skills/my-skill
```

## Naming

- Directory name = `name` field exactly
- Lowercase, numbers, hyphens only (max 64 chars)
- No leading/trailing/consecutive hyphens
- Action-oriented: `go-sqlc`, `shell-scripting`, `create-skill`
- Project-local skills use a project prefix: `paperos-create-new-api-sheets-csv`

## Frontmatter

```yaml
---
name: skill-name
description: Does X. Use when [trigger keywords]. Covers [scope].
---
```

### Required fields

- `name` - becomes the `/slash-command`. Falls back to directory name if omitted.
- `description` - the Ai Agent reads this to decide when to auto-load the skill.
  Write it for the machine, not the human. Include trigger keywords and scope.
  Max 1024 chars.

### Optional fields

| Field | Type | Purpose |
|-------|------|---------|
| `argument-hint` | string | Autocomplete hint, e.g. `[issue-number]` |
| `disable-model-invocation` | bool | `true` = only user can invoke via `/name` |
| `user-invocable` | bool | `false` = hidden from `/` menu, agent-only |
| `allowed-tools` | string | Tools allowed without permission prompts, comma-separated |
| `model` | string | Override session model when skill is active |
| `effort` | string | Override effort level: `low`, `medium`, `high`, `max` |
| `context` | string | `fork` = run in subagent instead of inline |
| `agent` | string | Subagent type when `context: fork` (e.g. `Explore`, `Plan`) |
| `paths` | string/list | Glob patterns limiting when skill activates |
| `hooks` | object | Hooks scoped to this skill's lifecycle |
| `shell` | string | `bash` (default) or `powershell` for inline commands |

### String substitutions (available in skill body)

- `$ARGUMENTS` - all arguments passed when invoking
- `$ARGUMENTS[N]` or `$N` - specific argument by index

## Description field

The description is the most important field after `name`. The Ai Agent reads every
skill description at session start to decide relevance. A bad description means the
skill never loads or loads at wrong times.

Good descriptions:
- "HTTP routing and middleware patterns. Use when writing handlers, ServeMux routes, or middleware chains."
- "POSIX shell scripting conventions. Use when writing any shell script (.sh file), inline shell commands, or reviewing shell code. Covers shebang, error handling, variable naming, function naming, test syntax, JSON processing, and secrets hygiene."

Bad descriptions:
- "Shell stuff" - too vague, no trigger keywords
- "A comprehensive guide to writing production-ready shell scripts following POSIX standards with best practices for error handling" - marketing copy, no trigger keywords

Pattern: `[What it does]. Use when [trigger conditions]. Covers [specific topics].`

## Body

- Under 500 lines
- Imperatives, not prose ("Use `test`" not "You should use `test`")
- Code examples over explanations
- Tables for decision matrices (which middleware, which format, which tool)
- Numbered steps for procedures
- Cross-reference related skills at the end

Move long reference material to `references/<name>.md` and link from the skill body.

## Skill types

### Index skill

Points to focused sub-skills. Short, no procedures. Example: `go` skill.

```markdown
## Focused skills

| Skill | When to use |
|-------|-------------|
| `go-http-handlers` | HTTP handlers, ServeMux routes, middleware |
| `go-sqlc` | sqlc query design, code generation |
```

### Convention skill

Rules and patterns. Heavy on code examples and tables. Example: `shell-scripting`.

```markdown
## Basics

- **POSIX sh only.** Use `#!/bin/sh` - never bash.
- **Always `set -eu`.** Exit on error, error on undefined variables.

## Variable naming

| Prefix | Scope | Example |
|--------|-------|---------|
| `g_` | Global to script | `g_base_url` |
| `b_` | Block-scoped | `b_count` |
```

### Procedure skill

Step-by-step workflow. Numbered sections, decision tables for branching.
Example: `paperos-create-new-api-sheets-csv`.

```markdown
## 1. Write SQL query

Add to `db/queries/mariadb/<table>.sql`:
...

## 2. Generate Go code
...

## 3. Add handler
...
```

### Cleanup/review skill

Checklist of things to fix. Example: `strip-ai-tells`.

```markdown
## Formatting rules

### Dashes

- Replace m-dashes with spaced single hyphen (` - `)
- Exception: leave alone in code comments where author already uses them

### Arrows

- Replace arrows with `=>`
```

## Placement

| Scope | Path | Commit? |
|-------|------|---------|
| Global | `~/Agents/skills/<name>/SKILL.md` | To skills repo |
| Project-local | `./skills/<name>/SKILL.md` | To project repo |

Project-local skills need a symlink in `~/Agents/skills/` for the harness to find them.

When creating a skill, ask: "Is this specific to one repo, or useful across projects?"
