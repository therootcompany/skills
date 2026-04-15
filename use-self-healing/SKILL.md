---
name: use-self-healing
description: Log unexpected issues to agents/issues.d/ as they happen, then improve the underlying tools after each unit of work. Use when running scripts, CLI tools, deploys, or any multi-step process. Covers issue file format, post-task improvement targets, and the loop that turns workarounds into fixes.
---

The loop: log surprises while working → fix the tool that caused them after the task → delete the issue file. The point is converging on tools that don't surprise you, not building a permanent log.

## Issue files

One file per surprise in `agents/issues.d/` (gitignored by `repo-init`), named `YYYY-MM-DD_short-kebab-description.md`:

```markdown
# Deploy script hangs on missing env var

**Expected:** Script exits with clear error when DB_URL missing
**Actual:** Hangs waiting for connection timeout
**Solution:** OPEN — needs input validation added to deploy.sh
**Affected:** scripts/deploy.sh
**Needs Review:** YES — waiting on script fix
```

- MUST: Create the file the moment surprise occurs. Fill `Expected` and `Actual` immediately, with the **exact** error or output (not a paraphrase). Note the triggering command.
- MUST: Update with the solution once resolved.
- MUST: Delete the file once the underlying fix is committed. Keep only open issues on disk.
- PREFER: One issue per file — don't combine unrelated problems.

## Post-task improvement

After every distinct unit of work, walk `agents/issues.d/` and fix the source. Choose the target by where the friction lived:

| Friction in...   | Fix in...                                                          |
| ---------------- | ------------------------------------------------------------------ |
| Shell script     | The script (better error, new flag, validation)                    |
| CLI tool         | Tool source or its `--help` output                                 |
| API call         | Client code or API docs                                            |
| Skill/procedure  | SKILL.md steps, verification commands, decision tables             |
| Agent rules      | CLAUDE.md, AGENTS.md, or the relevant skill                        |
| Missing docs     | Wherever the next person would look for them                       |

Rules:

- MUST: Review `agents/issues.d/` after every task. Don't skip.
- MUST: Fix the **tool**, not just the doc. A one-line script fix beats a five-line troubleshooting section.
- NEVER: Leave a workaround in place without either filing it as an open issue or fixing the underlying tool.
- PREFER: Add a verification command to the procedure skill wherever the issue revealed a missing check.
- PREFER: Commit improvements separately from the task work — keeps the diff reviewable.
