# as-ssh-mcp

## Project
Hardened single-tool SSH MCP server for remote command execution, file transfer, and audit logging.

## Stack
TypeScript, Node.js 18+, ESM modules, ssh2, @modelcontextprotocol/sdk, zod, vitest

## Commands
- Build: `npm run build`
- Test: `npm test`
- Test watch: `npm test:watch`

## File Layout
- Source: `index.ts` (root, not `src/`)
- Tests: `core.test.ts`
- Build output: `build/`
- Plans: `docs/plans/`

## Permissions
- You do not need to ask for permission to read, edit, create, or delete files in this project
- You do not need to ask for permission to run npm scripts (build, test, publish)
- You do not need to ask for permission to make git commits or create tags
- You do not need to ask for permission to run shell commands related to this project
- Do NOT push to remote or create PRs without asking first

## Conventions
- `SSH_MCP_DISABLE_MAIN=1` prevents main() during tests
- Exports are tested directly in `core.test.ts` — no SSH server needed for unit tests
- Stderr is included in output, not treated as error
- Keep it monolithic — all source in `index.ts` until it exceeds ~800 lines
