# Go Testing Gotchas

Subtle behaviors that silently break tests. Load when writing or debugging
test fixtures — especially integration tests with real I/O cleanup.

## `t.Context()` is canceled before `t.Cleanup` runs

`t.Context()` (Go 1.24+) is canceled as soon as the test function returns.
`t.Cleanup` callbacks run **after** the test returns, so any I/O in a
cleanup closure that uses `t.Context()` (or a context derived from it) will
fail with `context canceled`.

Worse: if the cleanup discards the error (common pattern for best-effort
DROP/close), the failure is silent — leaking state into the next test.

```go
// WRONG — ctx is canceled by the time this runs
ctx := t.Context()
t.Cleanup(func() {
    _, _ = conn.ExecContext(ctx, "DROP TABLE IF EXISTS foo")
})

// RIGHT — fresh context for cleanup
t.Cleanup(func() {
    _, _ = conn.ExecContext(context.Background(), "DROP TABLE IF EXISTS foo")
})
```

### How this manifests

- First test run passes. Second run fails with "table already exists" or
  similar "resource already exists" errors.
- Cleanup code appears correct and errors are discarded, so there's no log.
- The bug only shows up when two tests share the same external resource
  (single-schema database, shared tmp dir, etc.).

### Defense in depth: pre-clean at setup

Even with the cleanup fix, interrupted test runs (SIGINT, panic, power
loss) can leak state. Pre-clean at the start of each test:

```go
func connect(t *testing.T) *sql.Conn {
    // ... open conn ...

    // Self-heal from any leftover state
    if _, err := conn.ExecContext(ctx, "DROP TABLE IF EXISTS _migrations"); err != nil {
        t.Fatalf("pre-cleanup: %v", err)
    }

    // Cleanup uses context.Background() — t.Context() is already canceled
    t.Cleanup(func() {
        _, _ = conn.ExecContext(context.Background(), "DROP TABLE IF EXISTS _migrations")
    })

    return conn
}
```

### Rule of thumb

- **Setup I/O**: use `t.Context()` — you want cancellation to propagate if
  the test is interrupted.
- **Cleanup I/O**: use `context.Background()` — you want the cleanup to
  actually run even though the test context is dead.
