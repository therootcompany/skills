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
- Secrets logged or included in error messages
- Timing-safe comparison for tokens and keys
- Session management (token lifetime, revocation)
- Credential storage (plaintext vs hashed)

### Cryptography and Randomness
- Weak random sources (`math/rand` for security-sensitive values)
- Hardcoded IVs, nonces, or salts
- Deprecated algorithms (MD5, SHA1 for security purposes)
- TLS configuration (minimum version, cipher suites)

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
- Check `go.mod` for unnecessary or abandoned dependencies
- Check for known vulnerabilities (`govulncheck` or advisory databases)

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
