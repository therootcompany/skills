---
name: go-review-style
description: Go code style and architecture review. Use when reviewing Go code for code smells, testability, maintainability, and design issues. Spawns named reviewer agents that write findings to disk.
depends:
  - use-modern-go
  - go
  - go-stack
---

## Prerequisites

MUST load before running the review:
- `use-modern-go` — modern Go idioms and version features
- `go` — error handling, config conventions, focused sub-skills index
- `go-stack` — approved libraries, import paths, build commands

PREFER: Also load sub-skills from the `go` and `shell-scripting` indexes that
are relevant to the codebase under review (e.g., `go-sqlc`, `go-http-handlers`,
`go-cli-flags`, `shell-scripting`).

## Review Process

1. Read the project's `AGENTS.md` to understand architecture and conventions
2. Partition the codebase into 2-4 review areas by concern (e.g., orchestration,
   domain logic, data layer, infra/IO)
3. Spawn one named reviewer agent per area, running in parallel
4. Each agent writes findings to `tmp.d/REVIEW.{name}.md`
5. After all agents complete, summarize the highlight reel to the user

### Agent Setup

Assign each reviewer a human name and a clear scope. MUST record each agent's
name and output file in `HANDOFF.md` so the review survives context compaction.

Example HANDOFF.md entry:
```
## Active Reviews
- Tom → tmp.d/REVIEW.tom.md — cmd/main.go orchestration
- Larry → tmp.d/REVIEW.larry.md — pkg/analysis/ domain logic
- Moe → tmp.d/REVIEW.moe.md — pkg/store/, pkg/events/, infra
```

### Agent Prompt Template

Each reviewer agent gets a prompt like:

> You are {Name}, a senior Go engineer doing a code review. Your focus is on
> **{scope description}**. Look for: {checklist items from below}.
>
> Read {file list}.
>
> Write your findings to {output path} in the format below.

## What to Look For

### Architecture and Design
- God functions (>100 lines doing multiple concerns)
- Untestable code (functions that require real infra to exercise)
- Hidden dependencies (global state, implicit ordering, `time.Now()` in logic)
- Separation of concerns (business logic mixed with I/O)
- Config struct bloat (>15 fields, per-instance fields hardcoded)

### Code Quality
- Duplicated logic across packages (especially filter functions, ordering maps)
- In-place mutation of shared data structures
- Inconsistent error handling (fatal vs warning for similar failures)
- Swallowed errors (silently using default on parse failure)
- Missing context propagation (no cancellation, no timeouts)

### Testability
- Functions that call `time.Now()` — pass `now time.Time` instead
- Functions that depend on pre-sorted input without enforcing it
- Pure functions that could be tested but have no tests
- Boundary conditions on thresholds (off-by-one, >=  vs >)

### Concurrency
- Sequential operations on independent resources
- Read-modify-write without transactions or locks
- N+1 query patterns in loops

### Go Idioms
- Use `errors.Is` / `errors.As` instead of string matching
- Domain types should not leak database types across package boundaries
- Prefer returning new slices over in-place mutation
- Map iteration order is non-deterministic — sort keys when order matters

## Output Format

MUST use this format for every review file:

```markdown
# Code Review -- {Name} ({scope})

## Summary
(2-3 sentence overview)

## Findings

### 1. [Title] -- [severity: critical/high/medium/low]
**Location:** file:line_range
**Issue:** what's wrong
**Suggestion:** how to fix it
**Effort:** S/M/L

(repeat for each finding)

## What's Good
(things done well -- be specific, not generic praise)
```

## Severity Definitions

| Level | Meaning |
|-------|---------|
| critical | Correctness bug, data loss risk, security hole |
| high | Significant maintainability or reliability problem |
| medium | Code smell that compounds over time |
| low | Nit, style, or latent risk with no current impact |

## What NOT to Flag

- Formatting and naming style (gofmt handles this)
- Missing comments on obvious code
- "I would have done it differently" without a concrete problem
- Hypothetical future requirements (YAGNI)
- Things already documented as intentional in AGENTS.md
