---
name: create-skill
description: Create a SKILL.md. Triggered when user asks to create a skill, document a pattern, or convert docs into a skill.
---

## Discovery

Harness scans for `SKILL.md` in known directories:

| Location | Path | Scope |
|----------|------|-------|
| Global | `~/Agents/skills/<name>/SKILL.md` | All projects |
| Project | `./skills/<name>/SKILL.md` | Current project only |

Project skills committed to git live at `./skills/<name>/SKILL.md`, symlinked into `~/Agents/skills/` so harness finds them:

```sh
ln -s ~/path/to/project/skills/my-skill ~/Agents/skills/my-skill
```

## Naming

- Directory name = `name` field exactly
- Lowercase, numbers, hyphens only (max 64 chars)
- No leading/trailing/consecutive hyphens
- Action-oriented: `golang-sqlc`, `shell-scripting`, `create-skill`
- Project skills use project prefix: `paperos-create-new-api-sheets-csv`

## Frontmatter

```yaml
---
name: skill-name
description: Does X. Use when [trigger keywords]. Covers [scope].
---
```

### Required fields

- `name` — becomes `/slash-command`. Falls back to directory name if omitted.
- `description` — harness reads this to decide when to auto-load. Write for the machine, not the human. Include trigger keywords and scope. Max 1024 chars.

### Optional fields

| Field | Type | Purpose |
|-------|------|---------|
| `argument-hint` | string | Autocomplete hint, e.g. `[issue-number]` |
| `disable-model-invocation` | bool | `true` = only user can invoke via `/name` |
| `user-invocable` | bool | `false` = hidden from `/` menu, agent-only |
| `allowed-tools` | string | Tools allowed without permission prompts, comma-separated |
| `model` | string | Override session model when skill active |
| `effort` | string | Override effort: `low`, `medium`, `high`, `max` |
| `context` | string | `fork` = run in subagent instead of inline |
| `agent` | string | Subagent type when `context: fork` (e.g. `Explore`, `Plan`) |
| `paths` | string/list | Glob patterns limiting activation |
| `hooks` | object | Hooks scoped to this skill's lifecycle |
| `shell` | string | `bash` (default) or `powershell` for inline commands |
| `tier` | string | `core` or `full` (default). Core = compressed version in `SKILL.core.md` |
| `max-tokens` | int | Advisory token budget for core tier. Skill compiler validates |
| `depends` | list | Skills this one assumes loaded, e.g. `[golang-sqlc, golang-stack]` |

### String substitutions (in skill body)

- `$ARGUMENTS` — all arguments passed when invoking
- `$ARGUMENTS[N]` or `$N` — specific argument by index

## Description field

Second most important field after `name`. Harness reads every description at session start to decide relevance. Bad description means skill never loads or loads at wrong times.

Good:
- "HTTP routing and middleware patterns. Use when writing handlers, ServeMux routes, or middleware chains."
- "POSIX shell scripting conventions. Use when writing any shell script (.sh file), inline shell commands, or reviewing shell code. Covers shebang, error handling, variable naming, function naming, test syntax, JSON processing, and secrets hygiene."

Bad:
- "Shell stuff" — vague, no trigger keywords
- "A comprehensive guide to writing production-ready shell scripts following POSIX standards with best practices for error handling" — marketing copy, no trigger keywords

Pattern: `[What it does]. Use when [trigger conditions]. Covers [specific topics].`

## Body

- Under 500 lines
- Imperatives, not prose ("Use `test`" not "You should use `test`")
- Code examples over explanations
- Tables for decision matrices (which middleware, format, tool)
- Numbered steps for procedures
- Cross-reference related skills at end
- Move long reference material to `references/<name>.md`, link from skill body
- Move troubleshooting to `references/troubleshooting.md`

### Context budget

Skills share context with script output, conversation, sub-skills. Target 32k total; aim for 16k where easy. Nail correctness first, then scale down — never sacrifice correctness for size.

Guidelines:
- **Index skills lean** (~1-3k chars). Sub-skills load on demand.
- **Don't duplicate script output.** Doctor script prints env vars? Don't list them in a skill table too.
- **Don't duplicate reference files.** Say "MUST read `references/foo.csv` when [trigger]" — don't summarize inline.
- **Cut redundancy, not information.** Content only in skill body (SSH config, decision logic, flag requirements) stays. Duplicates of example files or script output go.

### Tools over instructions

Once a procedure is proven (done manually, works reliably), extract mechanical steps into scripts. Models call scripts, not re-interpret procedures.

| Step is... | Put it in... | Skill says... |
|------------|--------------|---------------|
| Mechanical (fixed commands, no judgment) | Shell script in `scripts/` | `./scripts/deploy-foo.sh <host>` |
| Requires judgment (values, asking user) | Skill body | Describe what to decide and why |
| Both | Script for mechanical, skill for decision | "Ask user for X, then run `./scripts/foo.sh <host> X`" |

First time? Follow skill steps manually. After it works, write the script. Skill becomes an index: which scripts to run, what inputs to collect.

MUST: After completing a documented process or updating a procedure skill, review for scriptable steps. Any section with >3 sequential shell blocks for one operation is an extraction candidate. Skill body calls script in one line, not restating commands inline. Applies to new skills and revisiting existing ones.

### Scripts as agent context

Scripts aren't just automation — they're the agent's eyes. A script querying an API and printing structured output (TSV, `key\tvalue`, `# section` headers, `OK:`/`WARN:`/`ERROR:` prefixes) gives a smaller agent the context to make informed decisions without exploring the API itself.

Design script output for the consuming agent:
- Dense and parseable, not verbose and human-friendly
- `--help` prints usage on bad args (agent doesn't need an extra call)
- Flags like `--detail` for more context only when needed
- Colored summary at end for humans, structured body for agents

The agent runs scripts directly. Escalate to user only on genuine roadblocks (interactive prompts, missing credentials, permission decisions).

### Failure behavior

MUST: Skills should instruct the model to STOP and ask the user when something unexpected happens. Models waste tokens and cause damage improvising around failures.

```markdown
NEVER: Re-implement script steps inline. If a script fails, STOP and ask the user.
NEVER: Retry failed commands with different flags or workarounds without asking.
```

### Priority markers

Mark rules with inline priority so models focus on what matters and compilers can reorder or strip by importance.

| Marker | Meaning | Survives core tier? |
|--------|---------|---------------------|
| `MUST` / `NEVER` | Critical. Violations cause bugs, security issues, breakage | Yes |
| `PREFER` / `AVOID` | Strong default. Overridable with reason | No |
| Unmarked | Nice-to-have convention | No |

Inline at start of a rule, not as section headers:

```markdown
- MUST: No inline SQL in Go code. All queries through sqlc.
- PREFER: Explicit column lists over `SELECT *`.
- Use `ORDER BY updated_at DESC` for deterministic results.
```

Priority markers keep rules in topical order while letting compilers extract the critical subset. Never create separate "MUST rules" and "SHOULD rules" sections — breaks topical coherence.

### Core tier

For skills over ~2000 tokens, mark the essential subset with HTML comments:

```markdown
<!-- core -->
## The Critical Stuff

- MUST: ...
- NEVER: ...
<!-- /core -->

## Extended Reference

- PREFER: ...
```

Core tier rules:
- Max 150 lines (~1500 tokens)
- Only MUST/NEVER rules
- One code example per pattern (not before/after pairs)
- No troubleshooting, common-issues, or related-skills sections
- Tables compressed to essential rows only

Run `scripts/compile-skills.sh` to extract core sections into `SKILL.core.md`. The loader picks `SKILL.core.md` when the model has a small context window.

### Code examples

Prefer single examples with a comment showing the old pattern over before/after pairs. Halves token cost with no information loss:

Instead of:
```markdown
Before:
   ctx, cancel := context.WithCancel(context.Background())
   defer cancel()
After:
   ctx := t.Context()
```

Write:
```markdown
   // t.Context() not context.WithCancel(context.Background())
   ctx := t.Context()
```

### Procedure skills: verification

Each numbered step in a procedure skill MUST end with a verification command and expected output. Weaker models skip steps or continue past failures.

```markdown
## 3. Install PostgreSQL

curl https://webi.sh/postgres | sh
. ~/.config/envman/PATH.env

# VERIFY: must print version
postgres --version
```

## Skill types

### Index skill

Points to focused sub-skills. Short, no procedures. Example: `go` skill.

```markdown
## Focused skills

| Skill | When to use |
|-------|-------------|
| `golang-http-handlers` | HTTP handlers, ServeMux routes, middleware |
| `golang-sqlc` | sqlc query design, code generation |
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

Step-by-step workflow. Numbered sections, decision tables for branching. Example: `paperos-create-new-api-sheets-csv`.

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
| Project | `./skills/<name>/SKILL.md` | To project repo |

Project skills need a symlink in `~/Agents/skills/` for the harness to find them.

When creating a skill, ask: "Specific to one repo, or useful across projects?"
