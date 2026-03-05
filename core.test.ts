import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription, validateRemotePath, auditLog } from './index.js';
import type { AuditEntry } from './index.js';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';

describe('sanitizeCommand', () => {
  it('trims whitespace', () => {
    expect(sanitizeCommand('  ls -la  ')).toBe('ls -la');
  });

  it('rejects empty strings', () => {
    expect(() => sanitizeCommand('')).toThrow('Command cannot be empty');
  });

  it('rejects whitespace-only strings', () => {
    expect(() => sanitizeCommand('   ')).toThrow('Command cannot be empty');
  });
});

describe('escapeCommandForShell', () => {
  it('escapes single quotes', () => {
    expect(escapeCommandForShell("it's")).toBe("it'\"'\"'s");
  });

  it('passes through clean strings', () => {
    expect(escapeCommandForShell('ls -la')).toBe('ls -la');
  });
});

describe('validateConfig', () => {
  it('requires host', () => {
    const errors = validateConfig({ user: 'root', key: '/path' });
    expect(errors).toContain('Missing required --host');
  });

  it('requires user', () => {
    const errors = validateConfig({ host: '1.2.3.4', key: '/path' });
    expect(errors).toContain('Missing required --user');
  });

  it('requires key or password', () => {
    const errors = validateConfig({ host: '1.2.3.4', user: 'root' });
    expect(errors).toContain('Missing required --key or --password');
  });

  it('rejects invalid port', () => {
    const errors = validateConfig({ host: '1.2.3.4', user: 'root', key: '/path', port: 'abc' });
    expect(errors).toContain('Invalid --port');
  });

  it('passes valid config', () => {
    const errors = validateConfig({ host: '1.2.3.4', user: 'root', key: '/path/to/key' });
    expect(errors).toHaveLength(0);
  });

  it('accepts password instead of key', () => {
    const errors = validateConfig({ host: '1.2.3.4', user: 'root', password: 'pass' });
    expect(errors).toHaveLength(0);
  });
});

describe('sanitizeDescription', () => {
  it('strips newlines', () => {
    expect(sanitizeDescription('line1\nline2')).toBe('line1 line2');
  });

  it('strips carriage returns', () => {
    expect(sanitizeDescription('line1\r\nline2')).toBe('line1  line2');
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

describe('auditLog', () => {
  const testLogDir = path.join(import.meta.dirname, '.test-audit');
  const testLogFile = path.join(testLogDir, 'audit.log');

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
