---
name: golang-review-style
description: Go code style and architecture review. Use when reviewing Go code for code smells, testability, maintainability, and design issues. Spawns named reviewer agents that write findings to disk.
depends:
  - use-modern-go
  - golang
  - golang-stack
---

## Prerequisites

MUST load before running the review:
- `use-modern-go` — modern Go idioms and version features
- `golang` — error handling, config conventions, focused sub-skills index
- `golang-stack` — approved libraries, import paths, build commands

PREFER: Also load sub-skills from the `golang` and `shell-scripting` indexes that
are relevant to the codebase under review (e.g., `golang-sqlc`, `golang-http-handlers`,
`golang-cli-flags`, `shell-scripting`).

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
- MUST: Design for replaceability over readability, and certainly over
  changeability. Code that is easy to delete and rewrite from scratch is
  better than code that is easy to modify in place. Small, decoupled
  units with clear boundaries can be thrown away without ripple effects.
  Large, tangled units that are "easy to read" still resist replacement.
- God functions (>100 lines doing multiple concerns)
- Untestable code (functions that require real infra to exercise)
- Hidden dependencies (global state, implicit ordering, `time.Now()` in logic)
- MUST: Business logic must not be embedded in HTTP handlers. Handlers should be thin adapters that parse input, call domain functions, and write output. Domain logic (authorization code validation, PKCE verification, token creation) must be pure functions callable from tests without HTTP machinery.
- Separation of concerns (business logic mixed with I/O)
- Store/interface pattern — If one package correctly uses an interface for dependency injection (e.g., CredentialStore), other packages doing similar work should not bypass it by aquiring connections directly and creating Queries inline
- Config struct bloat (>15 fields, per-instance fields hardcoded)
- MUST: Main function testability — all initialization in main() makes unit testing impossible. Extract to `run(ctx context.Context, cfg *Config) error` or similar. Keep main() minimal: parse flags → validate config → call run.
- MUST: Database health checks — `pgxpool.New` succeeds even if database unreachable (lazy connection). First request fails. MUST ping after pool creation and in `/health` endpoint to fail fast on startup and report readiness correctly.

### Code Quality
- Duplicated logic across packages (especially filter functions, ordering maps)
- In-place mutation of shared data structures
- Inconsistent error handling (fatal vs warning for similar failures)
- Swallowed errors (silently using default on parse failure)
- MUST: Errors must be distinguishable — returning zero-value for both "not found" and "database error" makes debugging impossible. Use sentinel errors or custom error types.
- Missing context propagation (no cancellation, no timeouts)
- MUST: Context flows down from HTTP handlers to all downstream calls. Breaking the chain with `context.Background()` loses request-scoped values (tracing IDs, auth tokens, timeouts) and disables cancellation on SIGTERM.
- CLI flag/ENV semantics: Must track whether flag was explicitly provided. `if envPort != "" && *port == "3080"` fails when user passes `-port 3080` explicitly — env var still overrides. Use `flag.IsSet()` or empty-string default to detect "no flag provided".

### Testability
- MUST: Functions must not call `time.Now()`, `time.Since()`, or other
  ambient-state functions. Pass `now time.Time` as a parameter. Impure
  functions that read the clock, the filesystem, or the network are
  untestable without mocking — and mocking is the wrong fix. The right
  fix is to make the function pure by passing the value in.
- Functions that depend on pre-sorted input without enforcing it
- Pure functions that could be tested but have no tests
- Boundary conditions on thresholds (off-by-one, >=  vs >)

### Concurrency
- Sequential operations on independent resources
- Read-modify-write without transactions or locks
- N+1 query patterns in loops
- MUST: Servers MUST handle graceful shutdown — catch SIGTERM/SIGINT, call `server.Shutdown(ctx)` with timeout, wait for in-flight requests to complete. Abrupt termination (`http.ListenAndServe` returns on error only) cuts off active connections.
- MUST: Context hierarchy — startup context (10s timeout for DB ping, key loading), request context (from r.Context()), shutdown context (5s drain timeout). Don't reuse contexts across these boundaries.

### Go Idioms
- Use `errors.Is` / `errors.As` instead of string matching
- Domain types should not leak database types across package boundaries
- Prefer returning new slices over in-place mutation
- Map iteration order is non-deterministic — sort keys when order matters
- MUST: Panic in library code is wrong — return errors instead. Library code cannot know the caller's context. What's unrecoverable in a CLI may be retryable in a server. `json.Marshal` failure in library code should return error, not panic.
- MUST: Error wrapping conventions — `fmt.Errorf("context: %w", err)` preserves the original for `errors.Is`. Plain `fmt.Errorf("msg")` creates a new error each call, breaking `errors.Is` comparison to package-level vars.

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
