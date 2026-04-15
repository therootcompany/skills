---
name: bnna-postgres-build
description: Build a portable PostgreSQL binary from source using pg-essentials pg-build scripts. Use when the webi prebuilt binary is unavailable or incompatible (e.g. musl/Alpine, new version not yet released).
---

# bnna-postgres-build

Build a portable, relocatable PostgreSQL binary from source using the `pg-build` scripts from [pg-essentials](https://github.com/bnnanet/pg-essentials).

## When to Use This

- The webi prebuilt binary (`webi postgres@<version>`) is not yet available for a new PostgreSQL release
- The target environment uses musl libc (Alpine Linux) — webi prebuilts are glibc-linked and will not work
- You need a fully self-contained binary that runs on machines with no system Postgres installed
- You are deploying to a minimal container or CT where installing system packages is undesirable

## Source

```sh
git clone https://github.com/bnnanet/pg-essentials
cd pg-essentials
```

Or install via webi (installs client/server scripts but not the build scripts to a convenient path):

```sh
webi pg-essentials@stable
```

For building, clone the repo directly so `pg-build`, `pg-build-linux`, and `pg-build-macos` are all present in the same directory — `pg-build` dispatches to the OS-specific script using its own `$g_scriptdir`.

## Prerequisites

### Linux (APT — Debian/Ubuntu)

The `pg-build-linux` script installs dependencies automatically on APT and APK systems. Required packages include:

- Build tools: `build-essential`, `bison`, `flex`
- Compiler: `clang`, `llvm` (defaults to LLVM 20, override with `POSTGRES_LLVM_VERSION`)
- Libraries: `libicu-dev`, `libreadline-dev`, `zlib1g-dev`, `libssl-dev`, `liblz4-dev`, `libzstd-dev`

### Linux (APK — Alpine/musl)

Same packages with Alpine naming conventions. The script detects the C library (`glibc` vs `musl`) automatically and adjusts accordingly. This is the primary reason to build from source — Alpine targets need a musl-linked binary.

### macOS

The `pg-build-macos` script installs everything automatically via Homebrew and Xcode Tools:

- `llvm@<clang-version>`, `openssl@3`, `icu4c`, `libedit`, `lz4`, `zstd`
- Code signing is applied automatically after patching

## Invocation

### Dispatcher (auto-detects OS)

```sh
./pg-build '<vendor-name>' '<pg-version>'
```

### Linux

```sh
./pg-build-linux '<vendor-name>' '<pg-version>'
# Example:
./pg-build-linux 'bnna' '17.2'
```

### macOS

```sh
./pg-build-macos '<vendor-name>' '<pg-version>'
# Example:
./pg-build-macos 'bnna' '18.1'
```

### Arguments

| Argument | Description |
|---|---|
| `<vendor-name>` | A label embedded in the output archive name (e.g. `bnna`, `custom`) |
| `<pg-version>` | Full PostgreSQL version including minor (e.g. `17.2`, `18.1`) |

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PATCH_VERSION` | `0` | Cosmetic patch version appended to the build label |
| `POSTGRES_LLVM_VERSION` | `20` | LLVM version to use (Linux only) |

## Output

Both scripts write output to `~/relocatable/` and produce two tarballs in the current working directory:

```
postgres-<version>-<arch>-linux.tar.gz    # Server + client bundle (Linux)
psql-<version>-<arch>-linux.tar.gz        # psql client tools only (Linux)

postgres-<version>-<arch>-darwin.tar.gz   # Server + client bundle (macOS)
psql-<version>-<arch>-darwin.tar.gz       # psql client tools only (macOS)
```

Architecture is detected automatically (`x86_64` or `aarch64`).

## What "Relocatable" Means

A standard `make install` bakes absolute paths into the binaries — moving the directory breaks library resolution. These scripts produce a self-contained tree where:

- All bundled libraries (lz4, readline, zlib, zstd, ICU) live in `./lib/` next to the binaries
- **Linux**: `patchelf` rewrites `RPATH` to `$ORIGIN/../lib` so the dynamic linker finds libraries relative to the binary's own location
- **macOS**: `install_name_tool` rewrites `@rpath` references to `@loader_path/../lib/` and then `codesign` re-signs the patched Mach-O binaries

Notably **excluded** from the bundle (intentionally):
- LLVM — too large
- OpenSSL — security-sensitive, prefer the system copy
- tzdata — present on all target systems

The result can be extracted to any path and run without any system Postgres or library installation.

## Relation to the webi Install Path

The webi installer places Postgres at:

```
~/.local/opt/postgres/
```

The `pg-build` tarballs are **not** automatically installed there. To use a self-built binary as the webi-managed installation:

1. Extract the tarball: `tar -xzf postgres-<version>-<arch>-linux.tar.gz`
2. Move or symlink the extracted directory to `~/.local/opt/postgres`
3. Ensure `~/.local/bin/postgres` (and `psql`, `pg_dump`, etc.) point into the new tree, or add `~/.local/opt/postgres/bin` to `PATH`

Alternatively, deploy the tarball directly on the target host without webi at all — extract to any stable path and configure `PATH` accordingly.

## Known Gotchas

- **Run on the target architecture.** These scripts cross-compile for the detected host arch only. Build on `aarch64` for ARM targets; build on `x86_64` for x86 targets.
- **musl targets must be built on a musl host.** You cannot produce a musl-linked binary from a glibc host. Build inside an Alpine container or CT when targeting Alpine deployments.
- **OpenSSL is not bundled.** The target system must have OpenSSL available. On Alpine: `apk add libssl3`. On Debian/Ubuntu: it's present by default.
- **LLVM version.** LLVM 20 is the default. If `clang-20` is not available in the distro's repos, set `POSTGRES_LLVM_VERSION` to a version that is (e.g. `POSTGRES_LLVM_VERSION=17`).
- **macOS code signing.** After `install_name_tool` patches the binaries, each binary must be re-signed. The script does this automatically with `codesign --force --sign -`. If running in a CI environment without a signing identity, this may fail — a `-` identity signs with an ad-hoc signature, which is sufficient for local and server use but not App Store distribution.
- **Build time.** A full build including extensions takes 10–30 minutes depending on the machine. The script builds 30+ contrib extensions (`pg_stat_statements`, `pgcrypto`, `uuid-ossp`, etc.).
- **Disk space.** The build tree is large. Ensure at least 2–3 GB free in `~/relocatable/` and the working directory before starting.

## Building with pgvector

pgvector is a third-party extension — it is not part of PostgreSQL contrib and is not built by `pg-build`. It must be compiled separately after the main Postgres build completes.

pg-essentials has **no pgvector support** as of this writing. The build is fully manual.

### How it works

pgvector uses PostgreSQL's standard PGXS build system. The build locates the Postgres installation via `pg_config` and installs into the paths it reports:

- The shared library (`.so` / `.dylib`) goes into `$(pg_config --pkglibdir)`
- The SQL and control files go into `$(pg_config --sharedir)/extension/`

### Build steps

```sh
git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git
cd pgvector

# Point to the pg_config from the target postgres build
export PG_CONFIG=/path/to/postgres/bin/pg_config

# Build without -march=native so the .so is portable across machines
make OPTFLAGS=""

make install
```

`make install` writes directly into the postgres tree reported by `pg_config`. If the postgres tree lives under a user-owned path (the typical case for relocatable builds), no `sudo` is needed.

### Portability: always use `OPTFLAGS=""`

By default pgvector compiles with `-march=native`, which optimizes for the build machine's exact CPU. The resulting `.so` will crash with "Illegal instruction" on any machine with a different (or older) CPU family. For any build intended to run on multiple hosts, always pass `OPTFLAGS=""`.

### Architecture requirement

pgvector must be compiled on the **same architecture and libc** as the Postgres binary it targets. You cannot build a musl-linked pgvector on a glibc host (or vice versa), and you cannot build an `aarch64` `.so` on an `x86_64` host.

### Including pgvector in the tarball

After `make install`, the relevant files inside the postgres tree are:

```
lib/vector.so               # (or vector.dylib on macOS)
share/extension/vector.control
share/extension/vector--*.sql
```

To include pgvector in a distributable tarball, run `make OPTFLAGS="" install` before the tarball step, or re-pack the tarball after installation. The `pg-build` scripts do not have a hook for this — the simplest approach is:

1. Run `pg-build` as normal to produce the tarball
2. Extract the tarball to a working directory
3. Build and install pgvector against the extracted tree's `bin/pg_config`
4. Re-pack the tarball

## Build Machine Setup

### Alpine / musl targets

Build inside an Alpine LXC or container. The `bnna-builder` CT is available:

```sh
ssh root@tls-10-11-10-2.a.bnna.net
```

This CT has `nesting=1` enabled, which is required if you need to run Docker or nested containers during the build. For plain source builds, nesting is not needed.

### Debian / Ubuntu / glibc targets

Use a Debian or Ubuntu VM or CT. The `pg-build-linux` script installs all APT dependencies automatically.

### macOS

Build directly on a local Mac. The `pg-build-macos` script handles all Homebrew dependencies and code signing automatically.

### Resource requirements

- **Disk**: 2–3 GB free in `~/relocatable/` and the working directory
- **Time**: 10–30 minutes depending on the machine
- **Memory**: 1–2 GB is sufficient; the build is CPU-bound

### Retrieving the tarball from a remote build host

After the build completes on a remote host, copy the tarballs back:

```sh
scp root@tls-10-11-10-2.a.bnna.net:~/pg-essentials/postgres-*.tar.gz .
scp root@tls-10-11-10-2.a.bnna.net:~/pg-essentials/psql-*.tar.gz .
```

## Publishing to bnnanet/postgresql-releases

Releases live at https://github.com/bnnanet/postgresql-releases.

### Existing release structure

Tag format: `REL_<major>_<minor>` (e.g. `REL_18_1`)
Release name: `postgres-<major>.<minor>` (e.g. `postgres-18.1`)

Asset naming convention (from the `postgres-18.1` release):

```
postgres-18.1.0-aarch64-darwin.tar.gz
postgres-18.1.0-aarch64-linux-gnu.tar.gz
postgres-18.1.0-aarch64-linux-musl.tar.gz
postgres-18.1.0-x86_64-darwin.tar.gz
postgres-18.1.0-x86_64-linux-gnu.tar.gz
postgres-18.1.0-x86_64-linux-musl.tar.gz
psql-18.1.0-aarch64-darwin.tar.gz
psql-18.1.0-aarch64-linux-gnu.tar.gz
psql-18.1.0-aarch64-linux-musl.tar.gz
psql-18.1.0-x86_64-darwin.tar.gz
psql-18.1.0-x86_64-linux-gnu.tar.gz
psql-18.1.0-x86_64-linux-musl.tar.gz
postgresql-18.1.tar.gz          # upstream source tarball
```

The patch version in the filename uses a three-part version (`18.1.0`) even when `pg-build` uses two parts (`18.1`). Adjust the rename step accordingly.

### Creating a new release

```sh
PG_VERSION="17.5"
PG_MAJOR_MINOR="17.5"   # for tag/name
PG_FULL="17.5.0"        # for asset filenames

gh release create "REL_${PG_VERSION//./_}" \
  --repo bnnanet/postgresql-releases \
  --title "postgres-${PG_MAJOR_MINOR}" \
  --notes "PostgreSQL ${PG_MAJOR_MINOR} portable builds"
```

### Uploading assets

```sh
gh release upload "REL_${PG_VERSION//./_}" \
  --repo bnnanet/postgresql-releases \
  postgres-${PG_FULL}-x86_64-linux-gnu.tar.gz \
  postgres-${PG_FULL}-x86_64-linux-musl.tar.gz \
  postgres-${PG_FULL}-aarch64-linux-gnu.tar.gz \
  postgres-${PG_FULL}-aarch64-linux-musl.tar.gz \
  psql-${PG_FULL}-x86_64-linux-gnu.tar.gz \
  psql-${PG_FULL}-x86_64-linux-musl.tar.gz \
  psql-${PG_FULL}-aarch64-linux-gnu.tar.gz \
  psql-${PG_FULL}-aarch64-linux-musl.tar.gz
```

Add macOS assets if built:

```sh
gh release upload "REL_${PG_VERSION//./_}" \
  --repo bnnanet/postgresql-releases \
  postgres-${PG_FULL}-x86_64-darwin.tar.gz \
  postgres-${PG_FULL}-aarch64-darwin.tar.gz \
  psql-${PG_FULL}-x86_64-darwin.tar.gz \
  psql-${PG_FULL}-aarch64-darwin.tar.gz
```

Both the server+client bundle (`postgres-*`) and the psql-only bundle (`psql-*`) should be uploaded for each platform. The upstream source tarball (`postgresql-<version>.tar.gz`) is optional but present in existing releases.
