import { describe, it, expect } from 'vitest';
import { sanitizeCommand, escapeCommandForShell, parseArgv, validateConfig, sanitizeDescription, validateRemotePath } from './index.js';

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
