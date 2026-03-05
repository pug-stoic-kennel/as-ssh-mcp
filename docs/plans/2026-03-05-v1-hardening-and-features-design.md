# as-ssh-mcp v1.0.0 Design — Hardening, File Transfer, Audit Logging

## Scope

- Harden existing exec tool against description injection
- Add SFTP file transfer (upload + download) over the existing SSH connection
- Add JSON Lines audit logging to a local file
- Prepare for npm publish as `as-ssh-mcp`

## Out of Scope

- Multi-host support
- FTPS
- Stderr-based logging

## Architecture

Extend the existing monolith (`index.ts`). Three tools (`exec`, `upload`, `download`) and an audit logger, all in one file. No new runtime dependencies — ssh2 already includes SFTP.

## Hardening

**Description injection:** Strip newlines and control characters (`[\n\r\x00-\x1f]`) from the `description` parameter before appending it as a shell comment.

**Path traversal protection:** Reject `remotePath` values that contain `..` after normalization. Log the raw requested path in the audit log.

**Transfer timeouts:** Reuse the existing `--timeout` flag for SFTP operations.

## File Transfer

Two new MCP tools, both using `conn.sftp()` from ssh2:

### `upload`

- Params: `localPath` (required), `remotePath` (required), `description` (optional)
- Uses `sftp.fastPut()`
- Returns confirmation with bytes transferred

### `download`

- Params: `remotePath` (required), `localPath` (required), `description` (optional)
- Uses `sftp.fastGet()`
- Returns confirmation with bytes transferred

### Shared behavior

- Reuse `SSHConnectionManager` — SFTP rides the existing SSH channel
- Respect `--timeout`
- Validate `remotePath` against traversal
- Audit logged
- No automatic directory creation — fails with a clear error if target directory doesn't exist

## Audit Logging

**Location:** `~/.ssh-mcp-asc/audit.log`

**Format:** JSON Lines, one object per line.

**Schema:**

```json
{
  "timestamp": "2026-03-05T14:30:00.000Z",
  "tool": "exec",
  "input": { "command": "apt update" },
  "exitCode": 0,
  "durationMs": 2340,
  "outputSize": 1587
}
```

For file transfers, `input` contains `{ "localPath": "...", "remotePath": "..." }`, `exitCode` is `0` (success) or `1` (failure), and `outputSize` is bytes transferred.

**Behavior:**

- Log directory created on first write if missing
- Append-only, no rotation (users can set up logrotate externally)
- Logging failures are silent — never block command execution
- Audit function wraps each tool handler, capturing timing and result

## npm Publish

- Rename package to `as-ssh-mcp` in `package.json`
- Update `bin` key to `as-ssh-mcp`
- Update `homepage` and `repository` URLs
- Tighten `files` field to ship only `build/`, `README.md`, `package.json`
- Ensure shebang in built output
- Version stays `1.0.0`
