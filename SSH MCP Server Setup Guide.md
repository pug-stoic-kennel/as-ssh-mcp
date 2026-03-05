# SSH MCP Server Setup Guide

Setup guide for `as-ssh-mcp` on your Hostinger VPS (Ubuntu 24.04) with a dedicated SSH key pair for MCP access only. Optimized for Claude Code and OpenCode with minimal token footprint.

## Your Environment

- Hostinger VPS: Ubuntu 24.04, 2 CPU, 8GB RAM, 100GB storage
- SSH: Port 22, key-only auth (password auth disabled)
- Local machine: macOS
- MCP Clients: Claude Code CLI, OpenCode

## Why a Dedicated MCP Key

You already have an SSH key you use as a human admin. Do not share it with the MCP tool. Create a separate key pair specifically for MCP access. Here's why:

**Independent revocation.** If the MCP tool behaves unexpectedly or the key is exposed, you revoke the MCP key without touching your admin access. You're never locked out.

**Audit trail.** When reviewing auth logs on the VPS (`/var/log/auth.log`), you can distinguish between your manual SSH sessions and MCP-initiated sessions by which key was used.

**Principle of least privilege.** The MCP key can be restricted further in the future (e.g., forced command, IP restrictions in `authorized_keys`) without affecting your admin workflow.

**Blast radius.** If a local tool or process leaks the key, only the MCP key is compromised. Your admin key remains safe.

---

## Prerequisites

Confirm these on your local Mac before starting.

**Node.js 18+**

```bash
node --version
```

If not installed or below 18:

```bash
brew install node
```

**Install as-ssh-mcp**

Option A — Clone and build from source:

```bash
git clone https://github.com/pug-stoic-kennel/as-ssh-mcp.git
cd as-ssh-mcp
npm install
npm run build
```

Note the full path to the built server (e.g., `/Users/YOUR_USERNAME/as-ssh-mcp/build/index.js`). You'll need it in Steps 5 and 6.

Option B — Install globally via npm (if published):

```bash
npm install -g as-ssh-mcp
```

This puts `as-ssh-mcp` on your PATH. Steps 5 and 6 become simpler because you reference `as-ssh-mcp` instead of the full path. See [docs/npm-local-install.md](docs/npm-local-install.md) for the full npm workflow.

**Existing SSH Admin Access**

Confirm you can SSH into your Hostinger VPS with your current admin key:

```bash
ssh YOUR_USER@YOUR_HOSTINGER_IP "echo connected"
```

If this fails, fix your admin SSH access first. Everything below depends on it.

---

## Step 1: Generate the Dedicated MCP Key Pair

On your local Mac, create a new ed25519 key specifically for MCP:

```bash
ssh-keygen -t ed25519 -f /Users/YOUR_USERNAME/.ssh/hostinger_mcp -C "mcp-ssh-access-hostinger"
```

When prompted for a passphrase, press Enter twice to skip it. The MCP server runs as an automated process and cannot prompt for a passphrase interactively.

This creates two files:

| File | Purpose |
|------|---------|
| `/Users/YOUR_USERNAME/.ssh/hostinger_mcp` | Private key (stays on your Mac, never shared) |
| `/Users/YOUR_USERNAME/.ssh/hostinger_mcp.pub` | Public key (goes on the VPS) |

---

## Step 2: Set Correct Permissions on the Key

```bash
chmod 600 /Users/YOUR_USERNAME/.ssh/hostinger_mcp
chmod 644 /Users/YOUR_USERNAME/.ssh/hostinger_mcp.pub
```

---

## Step 3: Copy the Public Key to Your VPS

Use your existing admin SSH access to push the new MCP public key to the VPS:

```bash
ssh-copy-id -i /Users/YOUR_USERNAME/.ssh/hostinger_mcp.pub YOUR_USER@YOUR_HOSTINGER_IP
```

This appends the MCP public key to `~/.ssh/authorized_keys` on the VPS alongside your existing admin key.

**Verify it was added:**

```bash
ssh YOUR_USER@YOUR_HOSTINGER_IP "cat ~/.ssh/authorized_keys"
```

You should see at least two keys listed. One ending in your admin key comment, and one ending in `mcp-ssh-access-hostinger`.

---

## Step 4: Test the New MCP Key

Before wiring up the MCP server, confirm the dedicated key works on its own:

```bash
ssh -i /Users/YOUR_USERNAME/.ssh/hostinger_mcp YOUR_USER@YOUR_HOSTINGER_IP "echo mcp-key-works"
```

You should see `mcp-key-works` printed with no password prompt. If you get "Permission denied (publickey)", the public key wasn't added correctly to the VPS. Go back to Step 3.

---

## Step 5: Add SSH MCP to Claude Code

Run this from your Mac terminal.

If you installed from source (Option A):

```bash
claude mcp add --transport stdio as-ssh-mcp --scope user -- node /path/to/as-ssh-mcp/build/index.js --host=YOUR_HOSTINGER_IP --port=22 --user=YOUR_USER --key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp --timeout=120000 --maxChars=none
```

If you installed globally via npm (Option B):

```bash
claude mcp add --transport stdio as-ssh-mcp --scope user -- as-ssh-mcp --host=YOUR_HOSTINGER_IP --port=22 --user=YOUR_USER --key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp --timeout=120000 --maxChars=none
```

**Flag breakdown:**

| Flag | Value | Why |
|------|-------|-----|
| `--host` | Your VPS IP | Hostinger server address |
| `--port` | 22 | Your fixed SSH port |
| `--user` | Your SSH username | The user you SSH in as |
| `--key` | Full path to MCP private key | The dedicated key from Step 1 |
| `--timeout` | 120000 | 2 minutes per command (good for installs, builds) |
| `--maxChars` | none | No truncation on command output |

**Important notes on flags:**

Use the FULL ABSOLUTE PATH for `--key` (starting with `/Users/...`), not `~/.ssh/...`. MCP servers may not expand the tilde correctly.

`--scope user` makes the MCP server available across all your Claude Code sessions. Use `--scope project` to limit it to one project.

---

## Step 6: Add SSH MCP to OpenCode

Add to your `opencode.json`.

If you installed from source (Option A):

```json
{
  "mcp": {
    "as-ssh-mcp": {
      "type": "local",
      "command": [
        "node",
        "/path/to/as-ssh-mcp/build/index.js",
        "--host=YOUR_HOSTINGER_IP",
        "--port=22",
        "--user=YOUR_USER",
        "--key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp",
        "--timeout=120000",
        "--maxChars=none"
      ],
      "enabled": true
    }
  }
}
```

If you installed globally via npm (Option B):

```json
{
  "mcp": {
    "as-ssh-mcp": {
      "type": "local",
      "command": [
        "as-ssh-mcp",
        "--host=YOUR_HOSTINGER_IP",
        "--port=22",
        "--user=YOUR_USER",
        "--key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp",
        "--timeout=120000",
        "--maxChars=none"
      ],
      "enabled": true
    }
  }
}
```

---

## Step 7: Verify MCP Connection

**In Claude Code:**

Start a new session and ask:

```
Run "uname -a" on my VPS via SSH
```

You should see Ubuntu 24.04 kernel info returned.

**In OpenCode:**

Same test. Confirm the output matches your VPS.

**Verify in VPS auth log (optional):**

```bash
ssh YOUR_USER@YOUR_HOSTINGER_IP "tail -20 /var/log/auth.log"
```

Look for an accepted publickey entry with the `mcp-ssh-access-hostinger` comment. This confirms the MCP tool is using its dedicated key, not your admin key.

---

## Available Tools

as-ssh-mcp exposes three tools to MCP clients:

| Tool | What it does |
|------|-------------|
| **exec** | Run a shell command and return stdout, stderr, and exit code |
| **upload** | Transfer a local file to the remote server via SFTP |
| **download** | Transfer a remote file to the local machine via SFTP |

All tool calls are logged to `~/.ssh-mcp-asc/audit.log` on the machine running the MCP server. See the Audit Logging section below.

---

## Token Optimization

With 3 tools (`exec`, `upload`, `download`), this is a minimal token footprint for an SSH MCP server with file transfer.

For comparison:

| Server | Tools Exposed | Approx Token Cost |
|--------|--------------|-------------------|
| `as-ssh-mcp` | 3 | Minimal |
| `mcp-ssh-manager` | 37 | ~43,500 tokens |

---

## Audit Logging

Every tool call is logged as a JSON line to `~/.ssh-mcp-asc/audit.log`:

```json
{"timestamp":"2026-03-05T14:30:00.000Z","tool":"exec","input":{"command":"apt update"},"exitCode":0,"durationMs":2340,"outputSize":1587}
```

View recent activity:

```bash
tail -20 ~/.ssh-mcp-asc/audit.log | jq .
```

The log is append-only. Set up `logrotate` externally if the file grows too large.

---

## Key Management

**Your key inventory after setup:**

| Key | Purpose | Location |
|-----|---------|----------|
| Your admin key | Manual SSH sessions | `~/.ssh/YOUR_EXISTING_KEY` |
| `hostinger_mcp` | MCP tool access only | `~/.ssh/hostinger_mcp` |

**To revoke MCP access without affecting your admin access:**

SSH into the VPS with your admin key, then remove the MCP public key from `authorized_keys`:

```bash
ssh YOUR_USER@YOUR_HOSTINGER_IP
```

Then on the VPS:

```bash
sed -i '/mcp-ssh-access-hostinger/d' ~/.ssh/authorized_keys
```

This deletes only the line containing the MCP key comment. Your admin key remains untouched.

**To rotate the MCP key:**

1. Generate a new key pair (repeat Step 1 with a new filename)
2. Copy the new public key to the VPS (Step 3)
3. Revoke the old MCP key (command above)
4. Update the `--key` path in Claude Code and OpenCode configs (Steps 5-6)

---

## Recommended: Restrict the MCP Key

SSH `authorized_keys` supports per-key options that limit what a key can do, even after successful authentication. The MCP server only needs to execute commands and transfer files. It does not need port forwarding, X11 forwarding, or agent forwarding. Disabling these has zero downside and shrinks the attack surface.

**Apply the restrictions:**

SSH into the VPS with your admin key:

```bash
ssh YOUR_USER@YOUR_HOSTINGER_IP
```

Open `authorized_keys` for editing:

```bash
nano ~/.ssh/authorized_keys
```

Find the line ending in `mcp-ssh-access-hostinger` and prepend the restrictions to the beginning of that line:

```
no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA... mcp-ssh-access-hostinger
```

Save and exit. No restart needed. SSH reads this file on every connection.

**What each restriction does:**

| Option | What it blocks | Why it matters |
|--------|---------------|----------------|
| `no-port-forwarding` | SSH tunnels through the VPS | Prevents MCP key from reaching Docker containers or internal services via tunneling |
| `no-X11-forwarding` | Graphical display forwarding | Irrelevant on a headless VPS, but closing the door costs nothing |
| `no-agent-forwarding` | SSH agent passthrough | Stops a compromised MCP session from using your SSH agent to hop to other servers |

**Test after applying:**

```bash
ssh -i /Users/YOUR_USERNAME/.ssh/hostinger_mcp YOUR_USER@YOUR_HOSTINGER_IP "echo restrictions-ok"
```

Should still print `restrictions-ok`. Command execution and SFTP are unaffected by these restrictions.

### Optional: IP Locking

If you have a static home IP, you can also restrict the MCP key to connections from that IP only:

```
from="YOUR_HOME_IP",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA... mcp-ssh-access-hostinger
```

This means someone who steals the key file but connects from a different IP gets rejected. Skip this if your ISP rotates your IP address, or you'll lock out the MCP tool at random.

---

## Troubleshooting

**"Permission denied (publickey)"**

The MCP key isn't authorized on the VPS. Test manually with verbose output:

```bash
ssh -i /Users/YOUR_USERNAME/.ssh/hostinger_mcp -v YOUR_USER@YOUR_HOSTINGER_IP
```

Look for which key is being offered and whether it's accepted. Common causes: wrong file path, key not in `authorized_keys`, wrong permissions on the key file.

**"Connection timed out"**

Your VPS firewall may be blocking port 22. Check Hostinger's firewall settings in their control panel. Port 22 TCP must be open for your IP (or "Any" if no static IP).

**"Command timed out" in MCP**

The 2-minute default wasn't enough. Increase `--timeout` to 300000 (5 minutes) for long-running operations like `apt upgrade` or large Docker builds. Remove and re-add the server with the new timeout value.

**"Upload/Download failed"**

SFTP uses the same SSH connection as exec. If exec works but file transfers fail, check that the remote directory exists — as-ssh-mcp does not create directories automatically. Also verify the remote user has write permissions to the target path.

**MCP server not appearing in Claude Code**

Restart Claude Code after adding the MCP server. Verify registration:

```bash
claude mcp list
```

---

## Security Checklist

- [ ] Password auth disabled on VPS (`PasswordAuthentication no` in `sshd_config`)
- [ ] Dedicated MCP key created (not sharing admin key)
- [ ] MCP private key permissions are 600
- [ ] MCP public key permissions are 644
- [ ] `~/.ssh` directory permissions are 700
- [ ] MCP public key added to VPS `authorized_keys`
- [ ] MCP key tested independently before wiring to MCP server
- [ ] Key restrictions applied (`no-port-forwarding`, `no-X11-forwarding`, `no-agent-forwarding`)
- [ ] VPS firewall restricts port 22 to known IPs (or uses Fail2Ban)
- [ ] MCP private key is not committed to any git repository
- [ ] Admin key and MCP key are separate files with different comments

---

## Quick Reference

**Check MCP server status:**

```bash
claude mcp list
```

**Remove the MCP server:**

```bash
claude mcp remove as-ssh-mcp
```

**Update to latest version (from source):**

```bash
cd /path/to/as-ssh-mcp
git pull
npm install
npm run build
```

**Update to latest version (npm global):**

```bash
npm update -g as-ssh-mcp
```

Then restart any running MCP clients.

**Change configuration:**

Remove and re-add with new flags. From source:

```bash
claude mcp remove as-ssh-mcp
claude mcp add --transport stdio as-ssh-mcp --scope user -- node /path/to/as-ssh-mcp/build/index.js --host=NEW_IP --user=NEW_USER --key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp --timeout=120000 --maxChars=none
```

Or with npm global install:

```bash
claude mcp remove as-ssh-mcp
claude mcp add --transport stdio as-ssh-mcp --scope user -- as-ssh-mcp --host=NEW_IP --user=NEW_USER --key=/Users/YOUR_USERNAME/.ssh/hostinger_mcp --timeout=120000 --maxChars=none
```

**View audit log:**

```bash
tail -20 ~/.ssh-mcp-asc/audit.log | jq .
```
