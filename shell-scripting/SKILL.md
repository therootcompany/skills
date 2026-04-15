---
name: shell-scripting
description: POSIX shell scripting conventions. Use when writing any .sh file, non-trivial inline shell commands, or reviewing shell code. Covers shebang, set -eu, subshell error capture, variable/function naming, full-flag style, test syntax, jq, secrets hygiene, install order, and shfmt/shellcheck.
---

## Basics

- MUST: POSIX sh only. Use `#!/bin/sh` - never bash. No bashisms: no process
  substitution `<(...)`, no arrays, no `[[`, no `local`, no `declare`.
- MUST: Always `set -eu`. Every script starts with `set -eu` - exit on error,
  error on undefined variables.
- MUST: Use `test` instead of `[ ... ]`. `test` is the command; `[` is a noisier
  alias. Write `if test -e file` not `if [ -e file ]`.

## Subshells and error handling

- NEVER: Use command substitution inside a quoted string. The exit code is
  swallowed and `set -e` cannot catch the failure. Assign first, then use:

  ```sh
  # NEVER — inline in a string, or quoted assignment (both swallow exit code)
  echo "Hello $(whoami)"
  b_name="$(whoami)"
  b_result="$(curl -sf "$url")"

  # ALWAYS — bare assignment, then use the variable
  b_name=$(whoami)
  echo "Hello ${b_name}"
  ```

  Rule: `$()` must be the entire value of a bare assignment (`b_x=$(cmd)`).
  Never embed it in a quoted string.

- NEVER: Use the `&&`/`||` pattern as a ternary. It is not `if/then/else` —
  if the `&&` command fails, the `||` command runs too:

  ```sh
  # BAD: "evil ternary" — if mkdir succeeds but cd fails, rm runs
  test -d foo && cd foo || rm -rf foo

  # GOOD: explicit if/then/else
  if test -d foo; then
      cd foo
  else
      rm -rf foo
  fi
  ```

  `cmd || fallback` alone is fine when `cmd` is a single simple command
  (e.g. `command -v ... || go install ...`). Chaining `&&` with `||` creates
  the false ternary that breaks under `set -e`.

## Variable naming

- MUST: `ALL_CAPS` is for exported environment variables ONLY (`PATH`, `HOME`, `WEBI_VERSION`).
  NEVER use ALL_CAPS for script-local or function-local variables — those MUST use a lowercase prefix.
- MUST: All script variables use a lowercase prefix to make scope obvious at a glance.

| Prefix      | Scope / use                          | Example              |
|-------------|--------------------------------------|----------------------|
| `ALL_CAPS`  | Exported env vars only               | `PATH`, `HOME`       |
| `g_`        | Global to the script (and sourced)   | `g_base_url`         |
| `b_`        | Block-scoped (function, loop, cond)  | `b_count`            |
| `a_`        | Function arguments                   | `a_email`            |

## Function and command naming

- `fn_name` - helper functions (anything other than the main/entry function)
- `cmd_name` - command aliases, e.g. `cmd_curl='curl --fail-with-body -sSL'`

## Flag style

- MUST: Use full flag names in committed code (scripts, docs, help text,
  templates) — `--verbose`, not `-v`. Long names self-document; short flags
  require a man page to read. Short flags are fine at the interactive prompt.

## JSON processing

- MUST: Use `jq` for all JSON processing - never python one-liners.
- PREFER: Pipe curl output through `jq | tee file.json` - formats JSON, shows
  output, and saves to file simultaneously.

```sh
curl -sSL "$url" | jq '.' | tee result.json
```

## Secrets hygiene

- MUST: Write secrets to `*.env` or `*.jwk` / `*.jwt` files covered by
  `.gitignore`. NEVER write to `/tmp/` or other world-readable paths.
- PREFER: Separate files per secret type (e.g. `prod.jwk` for signing key,
  `user.jwt` for minted token).
- MUST: Passwords use base58 charset only -
  `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`. No ambiguous
  chars (0/O, l/1/I), no shell-special chars (+/=), no escaping needed.

## Installing tools

PREFER: Stop at the first that works:

1. Follow the installation instructions in the relevant skill
2. `webi` - e.g. `webi shellcheck`, `webi shfmt`
3. System package manager (`apt-get`, `brew`, etc.) - last resort only

## Tools

- **keypairs** - JWT creation/inspection. Stdout = JWT string, stderr = decoded
  JSON. Key goes to `prod.jwk`, tokens to `<email>.jwt`.

## Linting and formatting

MUST: Run both before committing:

```sh
shellcheck script.sh
shfmt -i 0 -sr -ci -s -w script.sh
```

Flags: `-i 0` (tabs — matches the PostToolUse auto-fixer; using anything else
will get clobbered on the next Edit/Write), `-sr` (space before redirects),
`-ci` (indent case bodies), `-s` (simplify), `-w` (write in place; omit for diff).
