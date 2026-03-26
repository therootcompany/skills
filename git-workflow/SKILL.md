---
name: git-workflow
description: GitHub repo creation, branch protection, committing, WIP PRs, and merging. Use when creating a GitHub repo, starting a feature branch, managing PRs, or merging into main.
---

## Create a New GitHub Repo

Replace `<org>` with your GitHub organization or username:

```sh
gh repo create <org>/<name> --public --source . --remote origin --push
```

After the first push to `main`, apply branch protection:

```sh
gh api repos/<org>/<name>/branches/main/protection \
  --method PUT \
  --field enforce_admins=true \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field 'required_pull_request_reviews[required_approving_review_count]=0' \
  --field 'required_pull_request_reviews[dismiss_stale_reviews]=false' \
  --field 'required_status_checks=null' \
  --field 'restrictions=null'
# Note: required_status_checks MUST be included (even as null) or the API returns 422.
```

This enforces:
- PR required before any merge to `main`
- Linear history — no merge commits; rebase or squash only
- Rules apply to admins too (`enforce_admins=true`)
- No force pushes, no branch deletion

## Committing

Stage specific files — never `git add -A`:

```sh
git add path/to/file another/file
git commit -m "$(cat <<'EOF'
type: short summary of what and why
EOF
)"
```

Commit often. Each commit is a safe checkpoint.

## Feature Branches and WIP PRs

```sh
git checkout -b feature/my-thing
# work, commit
git push -u origin feature/my-thing
```

Open a draft PR immediately:

```sh
gh pr create \
  --title "WIP: my thing" \
  --body "$(cat <<'EOF'
## What

Brief description.

## Status

- [x] Initial scaffolding
- [ ] Tests
EOF
)" \
  --draft
```

Update the PR description as work progresses:

```sh
gh pr edit <number> --body "$(cat <<'EOF'
updated body...
EOF
)"
```

## History: Always Rebase or Squash

Never merge commits. Every branch must rebase onto `main` before merging.

Clean up a feature branch before merge:

```sh
# Rebase interactively to squash/fixup noise commits
git rebase -i main

# Or just rebase to keep all commits in order
git rebase main
git push --force-with-lease origin feature/my-thing
```

## Merging into Main — Only After Explicit Approval

1. Ask the user to review the PR. Do not merge without explicit sign-off.
2. Wait for clear approval: "looks good", "LGTM", "merge it", thumbs-up, etc.
3. Merge using rebase (preferred) or squash:

```sh
gh pr merge <number> --rebase   # preferred — keeps commits, linear history
# or
gh pr merge <number> --squash   # collapses all commits into one
```

**Never self-merge. Never use `--admin` to bypass branch protection.**
