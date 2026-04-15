---
name: git-squash-for-pr
description: >
  Squash branch commits into clean PR-ready history. Use when preparing a
  branch for review, cleaning up fix-on-fix commits, or consolidating
  iterative work before merge. Covers interactive rebase, commit grouping,
  and message conventions.
---

## Purpose

A PR going into main should have a small number of descriptive commits that
summarize the work — not the full history of how the work evolved. Fix-on-fix
commits, refactors-unto-themselves, and iterative refinements are noise.

## Principles

- MUST: Linear history — rebase or squash, never merge commits
- MUST: Each surviving commit should be a coherent unit of change that makes
  sense on its own (compiles, passes tests)
- MUST: Commit messages describe *what went into main*, not the development journey
- NEVER: Leave "fix typo", "address review feedback", or "oops" commits
- NEVER: Use `git rebase -i` (interactive — requires tty). Use `git reset --soft`
  and recommit instead

## Procedure

### 1. Sync with remote main

```sh
# Use origin/main as the base — local main may be stale or have accidental commits
git pull --rebase origin main
```

### 2. Review the full diff

```sh
# See the actual changes going into main (this is what matters)
git diff origin/main..HEAD --stat
git log --oneline origin/main..HEAD
```

### 3. Group commits by logical unit

Read the diff and log. Group related changes into logical units. Common
groupings:

- Feature implementation (the main new code)
- Supporting refactors (extraction, reorganization that enables the feature)
- Build/deploy changes (scripts, config, CI)
- Documentation/skills (AGENTS.md, skills/, docs)
- Test additions

Each group becomes one commit. Aim for 2-5 commits per PR. A single-commit
PR is fine for small changes.

Documentation updates (skills, deploy scripts, AGENTS.md) are valuable on
their own — don't fold them into unrelated feature commits just to reduce
commit count. A docs commit that captures hard-won knowledge is worth keeping
separate.

### 4. Soft reset and recommit

```sh
# Reset to base, keeping all changes staged
git reset --soft $(git merge-base origin/main HEAD)

# Now selectively stage and commit each logical group
# Use git diff --cached --stat to see what's staged
# Use git reset HEAD <path> to unstage files for later commits
# Use git add <path> to stage files for the current commit
```

MUST: After a soft reset, files deleted during the branch's history reappear
as staged. Check `git diff --cached --stat` against the pre-squash diff from
step 2 — any file that wasn't in the final diff should NOT be recommitted.
Unstage restored deletions with `git checkout -- <path>` before committing.

### 5. Commit message style

Follow the repo's existing convention (check `git log origin/main --oneline -10`).
Common pattern:

```
type(scope): short description

Optional body explaining *why*, not *what* (the diff shows what).
```

Types: `feat`, `fix`, `refactor`, `docs`, `build`, `test`, `chore`

### 6. Verify

```sh
# Confirm the diff is identical to before the squash
git diff origin/main..HEAD --stat
# Should match the output from step 2
```

### 7. Scan for sensitive data

MUST: Before pushing, scan the final diff for accidental secrets and PII.

```sh
git diff origin/main..HEAD | grep -iE \
  '(api[_-]?key|secret|password|token=|Bearer [a-zA-Z0-9]|\.env\b)' | head -20
git diff origin/main..HEAD | grep -iE \
  '(ssn|social.security|credit.card|\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b)' | head -20
```

Check that:
- No real API keys, tokens, or passwords (placeholders like `<api-key>` are fine)
- No PII (SSNs, emails of real people, phone numbers) unless intentional test data
- IDs (account IDs, user IDs, pandadoc IDs) are intentional, not leaked from
  local testing — if an ID appears in committed code, it's public forever
- No `.env` files, `.jwk` keys, or credential files staged

## Edge cases

- **Merge commits in branch history**: `git rebase origin/main` first to linearize,
  then squash. If rebase conflicts, resolve per-file using `git diff origin/main..HEAD`
  as the source of truth for final state.
- **Co-authored commits**: Preserve `Co-authored-by:` trailers in the squashed
  commit message.
- **Already-reviewed commits**: If some commits were already approved in review,
  ask before squashing them — reviewer may want to see the incremental change.

## Anti-patterns

- Don't squash everything into one giant commit if the PR has genuinely distinct
  logical changes (e.g. a refactor + a feature built on it)
- Don't rewrite commits that are already on main/shared branches
- Don't lose attribution — if someone else authored commits, keep their name
