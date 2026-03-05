# as-ssh-mcp

A hardened SSH MCP server for remote command execution and SFTP file transfer. Forked from [tufantunc/ssh-mcp](https://github.com/tufantunc/ssh-mcp) and stripped down for production VPS management via Claude Code, OpenCode, and other MCP clients.

## Tools

- **exec** — Run shell commands on the remote server
- **upload** — Transfer a local file to the remote server via SFTP
- **download** — Transfer a remote file to the local machine via SFTP

3 runtime dependencies, ~500 lines of source.

## Install

Requires Node.js 18+.

```bash
npm install -g as-ssh-mcp
```

Or from source:

```bash
git clone https://github.com/pug-stoic-kennel/as-ssh-mcp.git
cd as-ssh-mcp
npm install
npm run build
```

## Usage

### Claude Code

```bash
claude mcp add --transport stdio as-ssh-mcp --scope user -- npx as-ssh-mcp --host=YOUR_IP --user=YOUR_USER --key=/full/path/to/private/key --timeout=120000 --maxChars=none
```

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "as-ssh-mcp": {
      "type": "local",
      "command": [
        "npx",
        "as-ssh-mcp",
        "--host=YOUR_IP",
        "--user=YOUR_USER",
        "--key=/full/path/to/private/key",
        "--timeout=120000",
        "--maxChars=none"
      ],
      "enabled": true
    }
  }
}
```

### Claude Desktop / Cursor / Windsurf

```json
{
  "mcpServers": {
    "as-ssh-mcp": {
      "command": "npx",
      "args": [
        "as-ssh-mcp",
        "--host=YOUR_IP",
        "--user=YOUR_USER",
        "--key=/full/path/to/private/key",
        "--timeout=120000",
        "--maxChars=none"
      ]
    }
  }
}
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--host` | Yes | - | Hostname or IP of the remote server |
| `--user` | Yes | - | SSH username |
| `--key` | Yes* | - | Path to SSH private key |
| `--password` | Yes* | - | SSH password (use `--key` instead when possible) |
| `--port` | No | 22 | SSH port |
| `--timeout` | No | 60000 | Command timeout in milliseconds |
| `--maxChars` | No | 1000 | Max command length. Use `none` or `0` for unlimited |

*One of `--key` or `--password` is required.

## Output Format

Commands return stdout as-is. If the command writes to stderr, it's appended under a `[stderr]` label. Non-zero exit codes are appended as `[exit code: N]`.

Example output for `apt update` (which writes progress to stderr):

```
Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease
Reading package lists...
[stderr]
WARNING: apt does not have a stable CLI interface.
[exit code: 0]
```

## Audit Logging

All tool calls are logged to `~/.ssh-mcp-asc/audit.log` as JSON Lines. Each entry includes timestamp, tool name, input parameters, exit code, duration, and output size.

## Tests

```bash
npm test
```

## Security Notes

- Use SSH key authentication, not passwords
- Use a dedicated MCP-only key pair (not your admin key)
- Apply `authorized_keys` restrictions on the server side
- This server does not filter or block any commands by design
- Description parameters are sanitized to prevent command injection
- Remote file paths are validated to prevent path traversal
