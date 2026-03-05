# Installing as-ssh-mcp Locally via npm

This guide covers how to publish as-ssh-mcp to npm and install it globally on your machines, so you can run it as `as-ssh-mcp` without referencing a clone path.

## Why Local npm Install

When you run from a git clone, every MCP config must reference the full path to `build/index.js` on that specific machine. If you move the clone or set up a second machine, you have to update paths.

With `npm install -g`, the binary is on your PATH everywhere. Your MCP configs use `as-ssh-mcp` instead of `node /Users/adf/aaadev/as-ssh-mcp/build/index.js`.

## Step 1: Publish to npm

You only need to do this once.

```bash
cd /path/to/as-ssh-mcp

# Log in to your npm account
npm login

# Verify what will be published (no files you don't want)
npm pack --dry-run

# Publish
npm publish
```

Expected output from `npm pack --dry-run`:

```
📦  as-ssh-mcp@1.0.0
Tarball Contents
  README.md
  build/index.d.ts
  build/index.js
  package.json
```

If you see anything unexpected (test files, source code, node_modules), stop and check the `files` field in `package.json`.

## Step 2: Install Globally on Each Machine

On every Mac (laptop, Mac Mini, etc.):

```bash
npm install -g as-ssh-mcp
```

Verify it's installed:

```bash
as-ssh-mcp --help
```

This should print the usage error (since no `--host` was provided), confirming the binary is on your PATH.

## Step 3: Update Your MCP Configs

### Claude Code

```bash
claude mcp remove as-ssh-mcp
claude mcp add --transport stdio as-ssh-mcp --scope user -- as-ssh-mcp --host=YOUR_IP --user=YOUR_USER --key=/full/path/to/private/key --timeout=120000 --maxChars=none
```

### OpenCode

```json
{
  "mcp": {
    "as-ssh-mcp": {
      "type": "local",
      "command": [
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
      "command": "as-ssh-mcp",
      "args": [
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

## Updating

When you make changes to the source:

```bash
cd /path/to/as-ssh-mcp

# Bump version
npm version patch   # 1.0.0 → 1.0.1

# Build and publish
npm run build
npm publish
```

Then on each machine:

```bash
npm update -g as-ssh-mcp
```

Or if you want to skip npm entirely and install directly from your git clone:

```bash
cd /path/to/as-ssh-mcp
npm run build
npm install -g .
```

This installs the local build globally without publishing to npm. Useful for testing changes before publishing.

## Install from Git Without Publishing

If you never want to publish to npm but still want the global binary:

```bash
# On each machine
git clone https://github.com/pug-stoic-kennel/as-ssh-mcp.git
cd as-ssh-mcp
npm install
npm run build
npm install -g .
```

To update:

```bash
cd /path/to/as-ssh-mcp
git pull
npm install
npm run build
npm install -g .
```
