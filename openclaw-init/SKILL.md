---
name: openclaw_configuration
description: |
    Guides the agent on how to configure ANTHROPIC_BASE_URL (for custom Anthropic-compatible endpoints, proxies, or gateways) and how to change the port the OpenClaw Gateway runs on. Use this skill when the user wants to route Anthropic calls through a proxy, custom base URL, or adjust the gateway server port.
---

# OpenClaw Configuration Skill

## When to use this skill

- User asks how to set a custom `ANTHROPIC_BASE_URL`
- User wants to point Anthropic calls to a proxy, gateway, or compatible endpoint (e.g. OpenRouter, LiteLLM, Cloudflare, custom vLLM, etc.)
- User needs to change the default gateway port (18789)
- User is troubleshooting model connectivity or wants to run the gateway on a different port

## Configuring ANTHROPIC_BASE_URL

OpenClaw respects the `ANTHROPIC_BASE_URL` environment variable to override the default Anthropic endpoint (`https://api.anthropic.com`).

### Recommended ways to set it (in order of preference for persistence):

1.  **Via the main config file** (`~/.openclaw/openclaw.json`)

    ```
    {
      "env": {
        "ANTHROPIC_BASE_URL": "https://your-custom-endpoint.com"
      }
    }

    ```

2.  **Via a `.env` file**
    - Create or edit `~/.openclaw/.env` (or `.env` in the current working directory):

        ```
        ANTHROPIC_BASE_URL=https://your-custom-endpoint.com

        ```

3.  **One-time via shell export** (for testing):

    ```
    export ANTHROPIC_BASE_URL="https://your-custom-endpoint.com"
    openclaw gateway restart

    ```

**Important notes:**

- Do **not** append `/v1` or any path --- use only the base URL.
- After any change, always restart the gateway:

    ```
    openclaw gateway restart

    ```

- Verify with:

    ```
    openclaw models status --json

    ```

    or

    ```
    env | grep -i anthropic

    ```

## Changing the Gateway Port

The OpenClaw Gateway defaults to port **18789**.

### How to change the port:

1.  **Persistent via config** (recommended):

    ```
    {
      "gateway": {
        "port": 12345
      }
    }

    ```

2.  **Using the CLI** (updates config automatically):

    ```
    openclaw config set gateway.port 12345

    ```

3.  **Temporary / one-time**:

    ```
    openclaw gateway --port 12345

    ```

After changing, restart:

```
openclaw gateway restart

```

Check status:

```
openclaw gateway status

```

## Security Recommendation

For most setups, keep the gateway bound to loopback only:

```
{
  "gateway": {
    "bind": "loopback",
    "port": 18789
  }
}

```

Access remotely via SSH tunnel:

```
ssh -L 18789:127.0.0.1:18789 user@your-server

```

## Common Commands Summary

```
# Restart gateway after config changes
openclaw gateway restart

# Check gateway status and port
openclaw gateway status

# View model / provider configuration
openclaw models status --json

# Quick config edit
openclaw config set gateway.port 3000

```

When the user asks about these settings, provide the exact commands they need and remind them to restart the gateway.
