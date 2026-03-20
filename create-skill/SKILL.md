---
name: create-skill
description: Create a SKILL.md. Triggered when user asks to create a skill, document a pattern, or convert docs into a skill.
---

## Scope

Ask: global (`~/Agents/skills/<name>/`) or project-local (`skills/<name>/`)?

- **Global** — cross-project conventions (shell, JS, SQL patterns)
- **Project-local** — API patterns, db schemas, build tooling specific to this codebase

## Naming

- Directory name = `name` field exactly
- Lowercase, numbers, hyphens only
- No leading/trailing/consecutive hyphens
- Short, action-oriented: `write-go`, `write-shell-scripts`, `write-javascript`

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

**Global:** `~/Agents/skills/<name>/SKILL.md`  
**Project-local:** `skills/<name>/SKILL.md` (from project root)

Commit skills to git.
