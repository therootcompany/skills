---
name: use-self-healing
description: On-disk logging of unexpected issues and solutions during processes, then updating tools and docs after each unit of work. Use when running scripts, CLI tools, deploy procedures, or any multi-step process. Creates agents/ISSUES.md for issue tracking, solution logging, and post-task improvement of skills, scripts, agent instructions, and documentation.
---

## Issue Log

When working on a process involving scripts, CLI tools, or multi-step procedures,
maintain an on-disk log of unexpected behavior and solutions.

### Setup

Create individual issue files in `agents/issues.d/` (already gitignored per repo-init skill):

```
agents/issues.d/2026-04-07_deploy-hangs-on-missing-env.md
```

```markdown
# Deploy script hangs on missing env var

**Expected:** Script exits with clear error when DB_URL missing
**Actual:** Hangs waiting for connection timeout
**Solution:** OPEN - needs input validation added to deploy.sh
**Affected:** scripts/deploy.sh
**Needs Review:** YES - waiting on script fix
```

Delete the file when resolved and permanent fix applied.

### Rules

- MUST: Create a new file in `agents/issues.d/` for each unexpected outcome. Name it
  `YYYY-MM-DD_short-kebab-description.md`. Write "Expected" and "Actual" immediately.
- MUST: Update the issue file with the solution once resolved.
- MUST: Include the exact error message or unexpected output - not a paraphrase.
- MUST: Delete the issue file when resolved and permanent fix applied. Keep only open issues.
- PREFER: One issue per file. Don't combine unrelated problems.
- PREFER: Note the command or step that triggered the issue.

## Post-Task Improvement

After completing a distinct unit of work (task, deploy, migration, etc.),
review the issues log and update the tools that produced them.

### What to update

| If the issue was in... | Update... |
|------------------------|-----------|
| A shell script | The script itself (fix, add flag, improve error message) |
| A CLI tool | The tool's code or its `--help` output |
| An API call | The client code or API docs |
| A skill/procedure | The SKILL.md steps, verification commands, or decision tables |
| Agent instructions | CLAUDE.md, AGENTS.md, or relevant skill |
| Missing documentation | Add it where someone would look for it next time |

### Rules

- MUST: Review `agents/issues.d/` after completing each unit of work. Don't skip this step.
- MUST: For each resolved issue, determine if a tool, script, skill, or doc change
  prevents it from recurring. If yes, make the change now.
- MUST: If a script produced a confusing error, improve the error message in the script -
  not just in the skill docs.
- NEVER: Leave a workaround in place without filing it as a known issue or fixing the
  underlying tool.
- PREFER: Fix the tool over documenting the workaround. A one-line script fix beats
  a five-line troubleshooting section.
- PREFER: Add verification commands to procedure skills where an issue revealed a
  missing check.

### Checklist

After each completed unit of work:

1. Read through `agents/issues.d/` for resolved entries from this task
2. For each: can the tool/script/skill be improved to prevent recurrence?
3. Make the improvement (code fix, better error message, new flag, doc update)
4. Mark the issue as addressed in the log
5. Commit the improvements separately from the task work
