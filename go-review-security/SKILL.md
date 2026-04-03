---
name: go-review-security
description: Go security review. Use when auditing Go code for security vulnerabilities, unsafe patterns, and hardening opportunities. Spawns named reviewer agents that write findings to disk.
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
`go-auth`, `shell-scripting`).

## Review Process

1. Read the project's `AGENTS.md` to understand architecture, trust boundaries,
   and deployment model
2. Partition the codebase into 2-4 review areas by trust boundary (e.g., external
   input handling, authentication, data persistence, outbound calls)
3. Spawn one named reviewer agent per area, running in parallel
4. Each agent writes findings to `tmp.d/REVIEW.{name}.md`
5. After all agents complete, summarize the highlight reel to the user

### Agent Setup

Assign each reviewer a human name and a clear scope. MUST record each agent's
name and output file in `HANDOFF.md` so the review survives context compaction.

Example HANDOFF.md entry:
```
## Active Reviews
- Alice → tmp.d/REVIEW.alice.md — HTTP handlers, input validation
- Bob → tmp.d/REVIEW.bob.md — authentication, authorization, secrets
- Carol → tmp.d/REVIEW.carol.md — database queries, file I/O, path handling
```

### Agent Prompt Template

Each reviewer agent gets a prompt like:

> You are {Name}, a senior Go security engineer doing a security review. Your
> focus is on **{scope description}**. Look for: {checklist items from below}.
>
> Read {file list}.
>
> Write your findings to {output path} in the format below.

## What to Look For

### Input Validation and Injection
- SQL injection (parameterized queries vs string concatenation)
- Command injection (shell commands built from user input)
- Path traversal (user-controlled paths without validation)
- XSS (user data rendered into HTML without escaping)
- SSRF (user-controlled URLs in outbound HTTP calls)
- XML external entity (XXE) injection in XML parsers

### Authentication and Secrets
- MUST: Use `golib/auth` for authentication (`golib/auth/jwt` for JWT,
  `golib/auth/csvauth` or `golib/auth/envauth` for API keys). See `go-auth` skill.
- MUST: Use `golib/http/middleware` for HTTP auth middleware.
- Hardcoded credentials or API keys
- Secrets logged or included in error messages (including usernames in log lines)
- MUST: Timing-safe comparison for tokens and keys — `subtle.ConstantTimeCompare`
  leaks length via early return when slices differ in size. HMAC-SHA256 both sides
  with a random key before comparing to guarantee fixed-length digests:
  ```go
  // subtle.ConstantTimeCompare([]byte(a), []byte(b)) -- WRONG, leaks length
  func constantTimeEq(a, b string, key []byte) int {
      ma := hmac.New(sha256.New, key)
      ma.Write([]byte(a))
      mb := hmac.New(sha256.New, key)
      mb.Write([]byte(b))
      return subtle.ConstantTimeCompare(ma.Sum(nil), mb.Sum(nil))
  }
  ```
- MUST: Credentials passed as CLI flags are visible in `/proc/PID/cmdline`. Use
  env vars or file paths, never `-password <literal>` flags.
- MUST: Auth endpoints must rate-limit failures — disconnect or backoff after 3
  failed attempts. Without this, timing-attack mitigations are less effective.
- Session management (token lifetime, revocation)
- Credential storage (plaintext vs hashed)

### Cryptography and Randomness
- Weak random sources (`math/rand` for security-sensitive values)
- Hardcoded IVs, nonces, or salts
- Deprecated algorithms (MD5, SHA1 for security purposes)
- TLS configuration (minimum version, cipher suites)

### Protocol and State Machine
- MUST: State machine zero values must not grant access. If states are `iota`
  constants, ensure the zero value is a "not yet initialized" state, not a
  "greeted" or "authenticated" state. A fresh struct's zero-value fields must
  always represent the most restrictive state.
- MUST: Server error responses must not echo internal details (file paths, stack
  traces, handler error strings). Return a generic code (e.g., "550 Rejected")
  and log the real error server-side.
- MUST: State resets (e.g., after TLS upgrade) must clear all auth/privilege
  flags explicitly, not rely on zero values. Defense in depth against future
  refactors removing re-initialization steps.

### Network and HTTP
- HTTP clients without timeouts (blocks forever on slow/dead upstream)
- Unencrypted HTTP for sensitive data (credentials, PII, IP addresses)
- Missing TLS verification (`InsecureSkipVerify`)
- Response body not closed (resource leak)
- Unbounded reads (`io.ReadAll` on untrusted input without size limit)

### File and Resource Safety
- File descriptors not closed (leaked via `Open` without `defer Close`)
- Temp files in world-readable locations (`/tmp/` without restrictive perms)
- Race conditions on file operations (TOCTOU)
- Symlink following in sensitive paths

### Database and Persistence
- Transactions missing where atomicity is required (partial writes)
- Row-level locking missing on read-modify-write patterns
- Sensitive data stored unencrypted
- Connection strings or credentials in code or logs

### Error Handling and Information Disclosure
- MUST: Sentinel errors must use `errors.New`, not `fmt.Errorf` without `%w`.
  `fmt.Errorf("msg")` creates a new value each call — `errors.Is` works by
  accident (pointer equality on package-level var) but breaks if the var is
  ever reassigned or wrapped. `errors.New` is explicit and correct.
- Stack traces or internal paths leaked to clients
- Detailed error messages that reveal system internals
- Panic recovery missing in HTTP handlers
- Errors that bypass audit logging

### Concurrency
- Race conditions on shared state (maps, slices without mutex)
- Context not propagated (no cancellation on SIGINT/SIGTERM)
- Goroutine leaks (no shutdown mechanism)

### Supply Chain and Dependencies
- MUST: All Go dependencies must be from the approved stack in `go-stack`.
  Flag any 3rd-party import not listed there — requires explicit user approval.
- NEVER: Load JavaScript, CSS, or fonts from CDNs (unpkg, jsdelivr, cdnjs, etc).
  Vendor all static assets locally and serve via `go:embed` or from disk.
- MUST: 3rd-party dependencies (outside `github.com/therootcompany/golib`)
  must have a published version at least 30 days old. New or unreleased
  libraries haven't had time for community review. Requires explicit user
  approval to use a younger dependency.
  Run `go run <skills-dir>/go-review-security/scripts/check-dep-age.go --dir <module-dir>`
  to check all direct dependencies against proxy.golang.org publish dates.
- Check `go.mod` for unnecessary or abandoned dependencies
- Check for known vulnerabilities (`govulncheck` or advisory databases)

### Recursive Resource Budgets
- MUST: Any recursive evaluation with a global resource limit must use a shared
  counter (`*int` pointer or returned accumulator), not per-frame copies. Passing
  `count+1` to children creates sibling-blind counters — each child starts from
  the parent's snapshot, not the accumulated total across all branches.
  *Example: SPF `include:` chains where 9 includes each spawn 9 more yields 81
  DNS lookups against a limit of 10.*
- MUST: Every operation that consumes the budgeted resource must
  decrement/increment the counter — not just the obviously recursive ones. Leaf
  operations (network calls, allocations, I/O) are easy to miss.
  *Example: SPF `a:` and `mx:` mechanisms trigger DNS lookups but only `include:`
  incremented the counter.*
- MUST: Cap fan-out per operation independently of the global budget. A single
  permitted operation that expands into unbounded sub-operations defeats the
  global limit.
  *Example: one `mx:` mechanism can return 50 MX records, each requiring an A
  lookup — RFC 7208 §4.6.4 caps this at 10.*
- MUST: When a protocol distinguishes inline directives (evaluated in sequence,
  short-circuit on match) from deferred directives (evaluated only after all
  inline directives complete), enforce that distinction. Processing deferred
  directives inline changes evaluation order.
  *Example: SPF `redirect=` is a modifier per RFC 7208 §6.1, not a mechanism.*
- MUST: When reconstructing data for cryptographic verification, preserve ALL
  original fields — including unknown or unhandled ones. Dropping fields changes
  the hash input and causes valid signatures to fail.
  *Example: DKIM tag reconstruction that drops `i=`, `x=`, `l=` tags.*
- MUST: Size-guard untrusted input before expensive operations (hashing,
  canonicalization, deserialization, regex). Unbounded input passed to buffer-
  allocating operations is a memory exhaustion vector.

### Identity and Classification
- MUST: When classifying identifiers into organizational or administrative
  groups, use an authoritative registry — not string heuristics. Heuristics break
  on irregular structures and create exploitable false-positive alignments.
  *Example: use the Public Suffix List (`golang.org/x/net/publicsuffix`) for
  domain org-boundary extraction. Naive "last two labels" lets `evil.co.uk` align
  with `victim.co.uk`.*
- MUST: When a protocol defines a fallback path (secondary lookup, default value,
  alternative resolution), implement it. Missing fallbacks silently produce "none"
  results for inputs the fallback was designed to handle.
  *Example: DMARC org-domain fallback per RFC 7489 §6.6.3.*

### Denial of Service
- Unbounded allocations from untrusted input (large file uploads, huge JSON)
- Regex with catastrophic backtracking on user input
- Missing rate limiting on authentication endpoints
- Resource exhaustion via connection pooling

## Output Format

MUST use this format for every review file:

```markdown
# Security Review -- {Name} ({scope})

## Summary
(2-3 sentence overview of security posture)

## Findings

### 1. [Title] -- [severity: critical/high/medium/low]
**Location:** file:line_range
**Issue:** what's wrong and what an attacker could do
**Exploitability:** how easy is this to exploit in practice
**Suggestion:** how to fix it
**Effort:** S/M/L

(repeat for each finding)

## What's Good
(security practices done well -- be specific)
```

## Severity Definitions

| Level | Meaning |
|-------|---------|
| critical | Exploitable vulnerability with direct impact (RCE, auth bypass, data exfil) |
| high | Vulnerability requiring specific conditions or chaining to exploit |
| medium | Weakness that increases attack surface or violates defense-in-depth |
| low | Hardening opportunity, informational, or latent risk |

## What NOT to Flag

- Theoretical attacks that require physical access to the server
- Missing features that aren't in scope (e.g., "should add rate limiting" when
  the service is internal-only behind a VPN)
- Style preferences disguised as security concerns
- Risks already documented and accepted in AGENTS.md or LOCAL.md
