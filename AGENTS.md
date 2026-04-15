# Skills

Each skill is a `SKILL.md` in its own directory. Invoke via `/skill-name`.

Project-local skills (symlinked from project repos) are not listed here. Check
project AGENTS.md files for project-specific skills.

## Discovering skills

The tables below may be stale. To scan all available skills without loading their
full bodies into context, read just the frontmatter:

```sh
for b_skill in ~/Agents/skills/*/SKILL.md; do
    sed -n '2,/^---$/p' "$b_skill"
    echo ""
done
```

This prints each skill's `name` and `description` - enough to decide relevance
before loading the full skill.

## Meta

| Skill | When to use |
|-------|-------------|
| `agent-init` | First-time computer setup for Ai Agent assistance |
| `repo-init` | Initialize a repo for Ai Agent assistance (AGENTS.md, LOCAL.md, session files) |
| `create-skill` | Creating or updating a SKILL.md |

## Go

| Skill | When to use |
|-------|-------------|
| `golang` | Index skill - load first, points to the right sub-skill |
| `golang-stack` | Approved libraries, import paths, version features, build commands |
| `golang-http-handlers` | HTTP handlers, ServeMux routes, middleware |
| `golang-cli-flags` | CLI tools, flag.FlagSet, argument parsing |
| `golang-auth` | Authentication, API keys, JWT, csvauth |
| `go-db-migrations` | Database schema migrations |
| `golang-sqlc` | sqlc query design, code generation |
| `golang-import-sheet-data` | Google Sheets to CSV/TSV/ENV |
| `use-modern-go` | Modern Go syntax guidelines for a project's Go version |

## Web

| Skill | When to use |
|-------|-------------|
| `write-modern-javascript` | Vanilla JS for browser UIs - no transpiler, no framework |

## Workflow

| Skill | When to use |
|-------|-------------|
| `git-workflow` | GitHub repo creation, branch protection, committing, PRs, merging |
| `shell-scripting` | Writing or reviewing POSIX shell scripts |
| `strip-ai-tells` | Cleaning up AI-generated text, docs, commit messages, or markdown |

## Installing Tools

Preference order - stop at the first that works:

1. Follow the installation instructions in the relevant skill
2. `webi` - e.g. `webi go` (then `go install` for Go tools), `webi node@lts` (then `npm install` for Node tools)
3. System package manager (`apt-get`, `brew`, etc.) - last resort only
