# as-ssh-mcp v1.0.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the existing exec tool, add SFTP file transfer (upload/download), add JSON Lines audit logging, and prepare for npm publish as `as-ssh-mcp`.

**Architecture:** Extend the monolith in `index.ts`. Add `sanitizeDescription` and `validateRemotePath` helpers, an `auditLog` function, and `upload`/`download` tool registrations. All new functions are exported and tested in `core.test.ts`.

**Tech Stack:** TypeScript, ssh2 (SFTP via `conn.sftp()`), Node.js fs/promises, zod, vitest

---

### Task 1: Harden description parameter

**Files:**
- Modify: `index.ts:319-320` (description injection point)
- Modify: `index.ts` (add `sanitizeDescription` export)
- Modify: `core.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `core.test.ts`:

```typescript
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription } from './index.js';

describe('sanitizeDescription', () => {
  it('strips newlines', () => {
    expect(sanitizeDescription('line1\nline2')).toBe('line1 line2');
  });

  it('strips carriage returns', () => {
    expect(sanitizeDescription('line1\r\nline2')).toBe('line1 line2');
  });

  it('strips control characters', () => {
    expect(sanitizeDescription('hello\x00world')).toBe('hello world');
  });

  it('passes through clean strings', () => {
    expect(sanitizeDescription('update packages')).toBe('update packages');
  });

  it('returns undefined for undefined input', () => {
    expect(sanitizeDescription(undefined)).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `sanitizeDescription` is not exported from `./index.js`

**Step 3: Implement sanitizeDescription**

Add to `index.ts` after `escapeCommandForShell` (after line 89):

```typescript
export function sanitizeDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  return description.replace(/[\x00-\x1f]/g, ' ');
}
```

Update the exec tool handler at line 319-320. Replace:

```typescript
      const commandWithDescription = description
        ? `${sanitizedCommand} # ${description.replace(/#/g, '\\#')}`
        : sanitizedCommand;
```

With:

```typescript
      const safeDescription = sanitizeDescription(description);
      const commandWithDescription = safeDescription
        ? `${sanitizedCommand} # ${safeDescription.replace(/#/g, '\\#')}`
        : sanitizedCommand;
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add index.ts core.test.ts
git commit -m "fix: sanitize description to prevent command injection"
```

---

### Task 2: Add remote path validation

**Files:**
- Modify: `index.ts` (add `validateRemotePath` export)
- Modify: `core.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `core.test.ts`:

```typescript
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription, validateRemotePath } from './index.js';

describe('validateRemotePath', () => {
  it('allows absolute paths', () => {
    expect(() => validateRemotePath('/home/user/file.txt')).not.toThrow();
  });

  it('allows relative paths without traversal', () => {
    expect(() => validateRemotePath('file.txt')).not.toThrow();
  });

  it('rejects paths with .. components', () => {
    expect(() => validateRemotePath('/home/../etc/passwd')).toThrow('Path traversal');
  });

  it('rejects paths that are just ..', () => {
    expect(() => validateRemotePath('..')).toThrow('Path traversal');
  });

  it('rejects paths starting with ../', () => {
    expect(() => validateRemotePath('../../etc/shadow')).toThrow('Path traversal');
  });

  it('allows paths with .. in filenames', () => {
    expect(() => validateRemotePath('/home/user/file..backup')).not.toThrow();
  });

  it('rejects empty paths', () => {
    expect(() => validateRemotePath('')).toThrow('cannot be empty');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `validateRemotePath` is not exported from `./index.js`

**Step 3: Implement validateRemotePath**

Add to `index.ts` after `sanitizeDescription`:

```typescript
export function validateRemotePath(remotePath: string): string {
  if (!remotePath || !remotePath.trim()) {
    throw new McpError(ErrorCode.InvalidParams, 'Remote path cannot be empty');
  }
  const normalized = remotePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some(s => s === '..')) {
    throw new McpError(ErrorCode.InvalidParams, 'Path traversal (..) is not allowed');
  }
  return normalized;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add index.ts core.test.ts
git commit -m "feat: add validateRemotePath to reject path traversal"
```

---

### Task 3: Add audit logging

**Files:**
- Modify: `index.ts` (add `auditLog` and `AuditEntry` export)
- Modify: `core.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `core.test.ts`:

```typescript
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription, validateRemotePath, auditLog } from './index.js';
import type { AuditEntry } from './index.js';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';

describe('auditLog', () => {
  const testLogDir = path.join(import.meta.dirname, '.test-audit');
  const testLogFile = path.join(testLogDir, 'audit.log');

  // Clean up before and after
  const cleanup = () => {
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true });
    }
  };

  beforeEach(cleanup);
  afterAll(cleanup);

  it('writes a JSON line to the log file', async () => {
    const entry: AuditEntry = {
      timestamp: '2026-03-05T14:30:00.000Z',
      tool: 'exec',
      input: { command: 'ls -la' },
      exitCode: 0,
      durationMs: 100,
      outputSize: 42,
    };
    await auditLog(entry, testLogFile);
    const contents = readFileSync(testLogFile, 'utf8').trim();
    const parsed = JSON.parse(contents);
    expect(parsed.tool).toBe('exec');
    expect(parsed.exitCode).toBe(0);
    expect(parsed.outputSize).toBe(42);
  });

  it('appends multiple entries', async () => {
    const entry: AuditEntry = {
      timestamp: '2026-03-05T14:30:00.000Z',
      tool: 'exec',
      input: { command: 'ls' },
      exitCode: 0,
      durationMs: 50,
      outputSize: 10,
    };
    await auditLog(entry, testLogFile);
    await auditLog({ ...entry, input: { command: 'pwd' } }, testLogFile);
    const lines = readFileSync(testLogFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).input.command).toBe('ls');
    expect(JSON.parse(lines[1]).input.command).toBe('pwd');
  });

  it('creates the log directory if missing', async () => {
    const entry: AuditEntry = {
      timestamp: '2026-03-05T14:30:00.000Z',
      tool: 'upload',
      input: { localPath: '/tmp/a', remotePath: '/tmp/b' },
      exitCode: 0,
      durationMs: 200,
      outputSize: 1024,
    };
    await auditLog(entry, testLogFile);
    expect(existsSync(testLogFile)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `auditLog` and `AuditEntry` are not exported

**Step 3: Implement auditLog**

Add to `index.ts` after `validateRemotePath`. Add `import { appendFile, mkdir } from 'fs/promises'` and `import path from 'path'` and `import { homedir } from 'os'` to the top of the file:

```typescript
export interface AuditEntry {
  timestamp: string;
  tool: string;
  input: Record<string, string>;
  exitCode: number;
  durationMs: number;
  outputSize: number;
}

const DEFAULT_AUDIT_LOG = path.join(homedir(), '.ssh-mcp-asc', 'audit.log');

export async function auditLog(entry: AuditEntry, logFile: string = DEFAULT_AUDIT_LOG): Promise<void> {
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(logFile, JSON.stringify(entry) + '\n');
  } catch {
    // Logging failures are silent — never block command execution
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add index.ts core.test.ts
git commit -m "feat: add JSON Lines audit logging"
```

---

### Task 4: Wire audit logging into exec tool

**Files:**
- Modify: `index.ts:292-329` (exec tool handler)

**Step 1: No new test** — this wires auditLog into the existing exec handler. The audit function is already tested. Integration testing would require an SSH server.

**Step 2: Update the exec tool handler**

Replace the exec tool's async handler (lines 292-329) with:

```typescript
  async ({ command, description }) => {
    const sanitizedCommand = sanitizeCommand(command);
    const start = Date.now();

    try {
      if (!connectionManager) {
        if (!HOST || !USER) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing required host or username');
        }

        const sshConfig: SSHConfig = {
          host: HOST,
          port: PORT,
          username: USER,
        };

        if (KEY) {
          const fs = await import('fs/promises');
          sshConfig.privateKey = await fs.readFile(KEY, 'utf8');
        } else if (PASSWORD) {
          sshConfig.password = PASSWORD;
        }

        connectionManager = new SSHConnectionManager(sshConfig);
      }

      await connectionManager.ensureConnected();

      const safeDescription = sanitizeDescription(description);
      const commandWithDescription = safeDescription
        ? `${sanitizedCommand} # ${safeDescription.replace(/#/g, '\\#')}`
        : sanitizedCommand;

      const result = await execCommand(connectionManager, commandWithDescription);
      const outputText = result.content[0]?.text ?? '';

      const exitCodeMatch = outputText.match(/\[exit code: (\d+)\]/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 0;

      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'exec',
        input: { command: sanitizedCommand },
        exitCode,
        durationMs: Date.now() - start,
        outputSize: outputText.length,
      });

      return result;
    } catch (err: unknown) {
      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'exec',
        input: { command: sanitizedCommand },
        exitCode: -1,
        durationMs: Date.now() - start,
        outputSize: 0,
      });
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${message}`);
    }
  }
```

**Step 3: Run tests and build**

Run: `npm test && npm run build`
Expected: All tests PASS, build succeeds

**Step 4: Commit**

```bash
git add index.ts
git commit -m "feat: wire audit logging into exec tool"
```

---

### Task 5: Add upload tool

**Files:**
- Modify: `index.ts` (add `uploadFile` function and `upload` tool registration)
- Modify: `core.test.ts` (test `uploadFile` validates paths)

**Step 1: Write the failing test**

Add to `core.test.ts`. We can't integration-test SFTP without a server, but we can test that uploadFile is exported and that path validation is called. We already tested `validateRemotePath` in Task 2, so this test just confirms the function exists and rejects bad paths:

```typescript
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription, validateRemotePath, auditLog, uploadFile, downloadFile } from './index.js';

describe('uploadFile', () => {
  it('rejects path traversal in remotePath', async () => {
    // No SSH manager, so it should fail on path validation before SSH
    await expect(uploadFile(null as any, '/tmp/local', '../../etc/passwd'))
      .rejects.toThrow('Path traversal');
  });

  it('rejects empty remotePath', async () => {
    await expect(uploadFile(null as any, '/tmp/local', ''))
      .rejects.toThrow('cannot be empty');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `uploadFile` is not exported

**Step 3: Implement uploadFile**

Add to `index.ts` after the `execCommand` function. Need to import `SFTPWrapper` from ssh2, and `stat` from `fs/promises`:

```typescript
export async function uploadFile(
  manager: SSHConnectionManager,
  localPath: string,
  remotePath: string,
): Promise<{
  content: { type: 'text'; text: string }[];
  bytesTransferred: number;
}> {
  const validatedPath = validateRemotePath(remotePath);

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;

    timeoutId = setTimeout(() => {
      reject(new McpError(ErrorCode.InternalError, `Upload timed out after ${DEFAULT_TIMEOUT}ms`));
    }, DEFAULT_TIMEOUT);

    const conn = manager.getConnection();
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        clearTimeout(timeoutId);
        reject(new McpError(ErrorCode.InternalError, `SFTP session error: ${err.message}`));
        return;
      }

      sftp.fastPut(localPath, validatedPath, (err?: Error) => {
        clearTimeout(timeoutId);
        if (err) {
          reject(new McpError(ErrorCode.InternalError, `Upload failed: ${err.message}`));
          return;
        }

        import('fs/promises').then(fs => fs.stat(localPath)).then(stats => {
          resolve({
            content: [{ type: 'text', text: `Uploaded ${localPath} → ${validatedPath} (${stats.size} bytes)` }],
            bytesTransferred: stats.size,
          });
        }).catch(() => {
          resolve({
            content: [{ type: 'text', text: `Uploaded ${localPath} → ${validatedPath}` }],
            bytesTransferred: 0,
          });
        });
      });
    });
  });
}
```

Then register the tool after the `exec` registration:

```typescript
server.registerTool(
  'upload',
  {
    description: 'Upload a local file to the remote SSH server via SFTP.',
    inputSchema: {
      localPath: z.string().describe('Absolute path to the local file to upload'),
      remotePath: z.string().describe('Absolute path on the remote server to write the file'),
      description: z.string().optional().describe('Optional description of what this upload does'),
    },
  },
  async ({ localPath, remotePath, description }) => {
    const start = Date.now();

    try {
      if (!connectionManager) {
        if (!HOST || !USER) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing required host or username');
        }

        const sshConfig: SSHConfig = {
          host: HOST,
          port: PORT,
          username: USER,
        };

        if (KEY) {
          const fs = await import('fs/promises');
          sshConfig.privateKey = await fs.readFile(KEY, 'utf8');
        } else if (PASSWORD) {
          sshConfig.password = PASSWORD;
        }

        connectionManager = new SSHConnectionManager(sshConfig);
      }

      await connectionManager.ensureConnected();
      const result = await uploadFile(connectionManager, localPath, remotePath);

      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'upload',
        input: { localPath, remotePath },
        exitCode: 0,
        durationMs: Date.now() - start,
        outputSize: result.bytesTransferred,
      });

      return { content: result.content };
    } catch (err: unknown) {
      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'upload',
        input: { localPath, remotePath },
        exitCode: 1,
        durationMs: Date.now() - start,
        outputSize: 0,
      });
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${message}`);
    }
  }
);
```

**Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: All tests PASS, build succeeds

**Step 5: Commit**

```bash
git add index.ts core.test.ts
git commit -m "feat: add upload tool with SFTP transfer"
```

---

### Task 6: Add download tool

**Files:**
- Modify: `index.ts` (add `downloadFile` function and `download` tool registration)
- Modify: `core.test.ts` (add test)

**Step 1: Write the failing test**

Add to `core.test.ts`:

```typescript
describe('downloadFile', () => {
  it('rejects path traversal in remotePath', async () => {
    await expect(downloadFile(null as any, '../../etc/passwd', '/tmp/local'))
      .rejects.toThrow('Path traversal');
  });

  it('rejects empty remotePath', async () => {
    await expect(downloadFile(null as any, '', '/tmp/local'))
      .rejects.toThrow('cannot be empty');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `downloadFile` is not exported

**Step 3: Implement downloadFile**

Add to `index.ts` after `uploadFile`:

```typescript
export async function downloadFile(
  manager: SSHConnectionManager,
  remotePath: string,
  localPath: string,
): Promise<{
  content: { type: 'text'; text: string }[];
  bytesTransferred: number;
}> {
  const validatedPath = validateRemotePath(remotePath);

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;

    timeoutId = setTimeout(() => {
      reject(new McpError(ErrorCode.InternalError, `Download timed out after ${DEFAULT_TIMEOUT}ms`));
    }, DEFAULT_TIMEOUT);

    const conn = manager.getConnection();
    conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
      if (err) {
        clearTimeout(timeoutId);
        reject(new McpError(ErrorCode.InternalError, `SFTP session error: ${err.message}`));
        return;
      }

      sftp.fastGet(validatedPath, localPath, (err?: Error) => {
        clearTimeout(timeoutId);
        if (err) {
          reject(new McpError(ErrorCode.InternalError, `Download failed: ${err.message}`));
          return;
        }

        import('fs/promises').then(fs => fs.stat(localPath)).then(stats => {
          resolve({
            content: [{ type: 'text', text: `Downloaded ${validatedPath} → ${localPath} (${stats.size} bytes)` }],
            bytesTransferred: stats.size,
          });
        }).catch(() => {
          resolve({
            content: [{ type: 'text', text: `Downloaded ${validatedPath} → ${localPath}` }],
            bytesTransferred: 0,
          });
        });
      });
    });
  });
}
```

Then register the tool:

```typescript
server.registerTool(
  'download',
  {
    description: 'Download a file from the remote SSH server to the local machine via SFTP.',
    inputSchema: {
      remotePath: z.string().describe('Absolute path on the remote server to download'),
      localPath: z.string().describe('Absolute path on the local machine to write the file'),
      description: z.string().optional().describe('Optional description of what this download does'),
    },
  },
  async ({ remotePath, localPath, description }) => {
    const start = Date.now();

    try {
      if (!connectionManager) {
        if (!HOST || !USER) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing required host or username');
        }

        const sshConfig: SSHConfig = {
          host: HOST,
          port: PORT,
          username: USER,
        };

        if (KEY) {
          const fs = await import('fs/promises');
          sshConfig.privateKey = await fs.readFile(KEY, 'utf8');
        } else if (PASSWORD) {
          sshConfig.password = PASSWORD;
        }

        connectionManager = new SSHConnectionManager(sshConfig);
      }

      await connectionManager.ensureConnected();
      const result = await downloadFile(connectionManager, remotePath, localPath);

      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'download',
        input: { remotePath, localPath },
        exitCode: 0,
        durationMs: Date.now() - start,
        outputSize: result.bytesTransferred,
      });

      return { content: result.content };
    } catch (err: unknown) {
      await auditLog({
        timestamp: new Date().toISOString(),
        tool: 'download',
        input: { remotePath, localPath },
        exitCode: 1,
        durationMs: Date.now() - start,
        outputSize: 0,
      });
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${message}`);
    }
  }
);
```

**Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: All tests PASS, build succeeds

**Step 5: Commit**

```bash
git add index.ts core.test.ts
git commit -m "feat: add download tool with SFTP transfer"
```

---

### Task 7: npm publish prep

**Files:**
- Modify: `package.json` (rename, update URLs)
- Create: `.gitignore`
- Modify: `README.md` (update name references)

**Step 1: Update package.json**

Change these fields:
- `"name"`: `"ssh-mcp-asc"` → `"as-ssh-mcp"`
- `"bin"`: `"ssh-mcp-asc"` → `"as-ssh-mcp"`
- `"homepage"`: update with actual GitHub URL (ask user)
- `"repository.url"`: update with actual GitHub URL (ask user)
- `"files"`: keep as `["build"]` — npm includes `package.json` and `README.md` automatically

**Step 2: Create .gitignore**

```
node_modules/
build/
.DS_Store
.test-audit/
```

**Step 3: Update README.md**

Replace `ssh-mcp-asc` references with `as-ssh-mcp` throughout, and update the install/usage examples to use the npm package name.

**Step 4: Run build to verify**

Run: `npm run build && npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add package.json .gitignore README.md
git commit -m "chore: rename to as-ssh-mcp and prep for npm publish"
```

---

### Task 8: Final verification and publish

**Step 1: Clean build and test**

```bash
rm -rf build && npm run build && npm test
```

**Step 2: Dry run npm publish**

```bash
npm pack --dry-run
```

Verify only expected files are included: `build/`, `package.json`, `README.md`

**Step 3: Publish**

```bash
npm publish
```

**Step 4: Commit any final changes and tag**

```bash
git tag v1.0.0
```
