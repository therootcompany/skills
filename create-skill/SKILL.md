---
name: create-skill
description: Create a SKILL.md. Triggered when user asks to create a skill, document a pattern, or convert docs into a skill.
---

## Scope

Ask: global (`~/.claude/skills/<name>/`) or project-local (`skills/<name>/`)?

- **Global** — cross-project conventions (shell, JS, SQL patterns)
- **Project-local** — repo-specific patterns (routing, migrations)

## Naming

- Directory name = `name` field exactly
- Lowercase, numbers, hyphens only
- No leading/trailing/consecutive hyphens
- Short, action-oriented: `go-sqlc`, `shell`, `javascript`

## Description (frontmatter)

1–3 sentences max. Must include:
- What the skill does
- When to activate it (trigger keywords)
- Max 1024 chars

## Body

- Keep under 500 lines
- Use imperatives, not prose
- Move long refs to `references/<name>.md`, link from here
- No meta-commentary ("tips", "best practices")

## Structure

```markdown
---
name: skill-name
description: One sentence: does X. Use when [trigger].
---

## Section

Imperative content...
```

## Placement

**Global:** `~/.claude/skills/<name>/SKILL.md`  
**Project-local:** `skills/<name>/SKILL.md`

Commit project-local skills to git.
