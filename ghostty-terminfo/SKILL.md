---
name: ghostty-terminfo
description: Push Ghostty terminal info to remote servers. Use when SSH shows "Error opening terminal: xterm-ghostty" or "terminal is not fully functional". Covers terminfo installation for remote hosts.
---

## Problem

Ghostty uses `xterm-ghostty` terminfo which isn't available on most servers. SSH sessions fail with:

```
Error opening terminal: xterm-ghostty.
WARNING: terminal is not fully functional
```

## Solution

Push Ghostty's terminfo to the remote host:

```sh
infocmp -x xterm-ghostty | ssh YOUR-SERVER -- tic -x -
```

This compiles and installs the terminfo on the remote server for the current user.

## Usage

Replace `YOUR-SERVER` with the target hostname:

```sh
infocmp -x xterm-ghostty | ssh smtp5.cogburnbros.com -- tic -x -
```

For multiple servers, loop through them:

```sh
for host in server1 server2 server3; do
    infocmp -x xterm-ghostty | ssh "$host" -- tic -x -
done
```

## Reference

- Ghostty terminfo docs: https://ghostty.org/docs/help/terminfo