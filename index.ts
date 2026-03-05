#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Client, ClientChannel } from 'ssh2';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

function parseArgv() {
  const args = process.argv.slice(2);
  const config: Record<string, string | null> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const equalIndex = arg.indexOf('=');
      if (equalIndex === -1) {
        config[arg.slice(2)] = null;
      } else {
        config[arg.slice(2, equalIndex)] = arg.slice(equalIndex + 1);
      }
    }
  }
  return config;
}

const isTestMode = process.env.SSH_MCP_TEST === '1';
const isCliEnabled = process.env.SSH_MCP_DISABLE_MAIN !== '1';
const argvConfig = (isCliEnabled || isTestMode) ? parseArgv() : {} as Record<string, string>;

const HOST = argvConfig.host;
const PORT = argvConfig.port ? parseInt(argvConfig.port) : 22;
const USER = argvConfig.user;
const KEY = argvConfig.key;
const PASSWORD = argvConfig.password;
const DEFAULT_TIMEOUT = argvConfig.timeout ? parseInt(argvConfig.timeout) : 60000;

const MAX_CHARS_RAW = argvConfig.maxChars;
const MAX_CHARS = (() => {
  if (typeof MAX_CHARS_RAW === 'string') {
    const lowered = MAX_CHARS_RAW.toLowerCase();
    if (lowered === 'none') return Infinity;
    const parsed = parseInt(MAX_CHARS_RAW);
    if (isNaN(parsed)) return 1000;
    if (parsed <= 0) return Infinity;
    return parsed;
  }
  return 1000;
})();

function validateConfig(config: Record<string, string | null>) {
  const errors = [];
  if (!config.host) errors.push('Missing required --host');
  if (!config.user) errors.push('Missing required --user');
  if (!config.key && !config.password) errors.push('Missing required --key or --password');
  if (config.port && isNaN(Number(config.port))) errors.push('Invalid --port');
  return errors;
}

if (isCliEnabled) {
  const errors = validateConfig(argvConfig);
  if (errors.length > 0) {
    console.error('Configuration error:\n' + errors.join('\n'));
    console.error('\nUsage: ssh-mcp-asc --host=IP --user=USER --key=/path/to/key [--port=22] [--timeout=60000] [--maxChars=none]');
    process.exit(1);
  }
}

export function sanitizeCommand(command: string): string {
  if (typeof command !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'Command must be a string');
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    throw new McpError(ErrorCode.InvalidParams, 'Command cannot be empty');
  }

  if (Number.isFinite(MAX_CHARS) && trimmedCommand.length > (MAX_CHARS as number)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Command is too long (max ${MAX_CHARS} characters)`
    );
  }

  return trimmedCommand;
}

export function escapeCommandForShell(command: string): string {
  return command.replace(/'/g, "'\"'\"'");
}

export function sanitizeDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  return description.replace(/[\x00-\x1f]/g, ' ');
}

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export class SSHConnectionManager {
  private conn: Client | null = null;
  private sshConfig: SSHConfig;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: SSHConfig) {
    this.sshConfig = config;
  }

  async connect(): Promise<void> {
    if (this.conn && this.isConnected()) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      this.conn = new Client();

      const timeoutId = setTimeout(() => {
        this.conn?.end();
        this.conn = null;
        this.isConnecting = false;
        this.connectionPromise = null;
        reject(new McpError(ErrorCode.InternalError, 'SSH connection timeout'));
      }, 30000);

      this.conn.on('ready', () => {
        clearTimeout(timeoutId);
        this.isConnecting = false;
        resolve();
      });

      this.conn.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        this.conn = null;
        this.isConnecting = false;
        this.connectionPromise = null;
        reject(new McpError(ErrorCode.InternalError, `SSH connection error: ${err.message}`));
      });

      this.conn.on('end', () => {
        this.conn = null;
        this.isConnecting = false;
        this.connectionPromise = null;
      });

      this.conn.on('close', () => {
        this.conn = null;
        this.isConnecting = false;
        this.connectionPromise = null;
      });

      this.conn.connect(this.sshConfig);
    });

    return this.connectionPromise;
  }

  isConnected(): boolean {
    if (!this.conn) return false;
    const sock = (this.conn as unknown as { _sock?: { destroyed?: boolean } })._sock;
    return sock !== undefined && !sock.destroyed;
  }

  async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  getConnection(): Client {
    if (!this.conn) {
      throw new McpError(ErrorCode.InternalError, 'SSH connection not established');
    }
    return this.conn;
  }

  close(): void {
    if (this.conn) {
      this.conn.end();
      this.conn = null;
    }
  }
}

let connectionManager: SSHConnectionManager | null = null;

export async function execCommand(
  manager: SSHConnectionManager,
  command: string
): Promise<{
  content: { type: 'text'; text: string }[];
}> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    let isResolved = false;

    const conn = manager.getConnection();

    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;

        conn.exec(
          'timeout 3s pkill -f \'' + escapeCommandForShell(command) + '\' 2>/dev/null || true',
          (err: Error | undefined, abortStream: ClientChannel | undefined) => {
            if (abortStream) {
              abortStream.on('close', () => {});
            }
          }
        );

        reject(
          new McpError(
            ErrorCode.InternalError,
            `Command execution timed out after ${DEFAULT_TIMEOUT}ms`
          )
        );
      }
    }, DEFAULT_TIMEOUT);

    conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
      if (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(new McpError(ErrorCode.InternalError, `SSH exec error: ${err.message}`));
        }
        return;
      }

      let stdout = '';
      let stderr = '';

      try {
        stream.end();
      } catch (_) {}

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      stream.on('close', (code: number) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          let output = stdout;
          if (stderr) {
            output += (stdout ? '\n' : '') + '[stderr]\n' + stderr;
          }

          if (code !== 0) {
            output += (output ? '\n' : '') + `[exit code: ${code}]`;
          }

          resolve({
            content: [{ type: 'text', text: output }],
          });
        }
      });
    });
  });
}

const server = new McpServer({
  name: 'SSH MCP Server (ASC)',
  version: '1.0.0',
});

server.registerTool(
  'exec',
  {
    description: 'Execute a shell command on the remote SSH server and return the output. Stderr is included in the response, not treated as an error.',
    inputSchema: {
      command: z
        .string()
        .describe('Shell command to execute on the remote SSH server'),
      description: z
        .string()
        .optional()
        .describe('Optional description of what this command will do'),
    },
  },
  async ({ command, description }) => {
    const sanitizedCommand = sanitizeCommand(command);

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

      return await execCommand(connectionManager, commandWithDescription);
    } catch (err: unknown) {
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${message}`);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = () => {
    if (connectionManager) {
      connectionManager.close();
      connectionManager = null;
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => {
    if (connectionManager) {
      connectionManager.close();
    }
  });
}

if (isTestMode) {
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error('Fatal error connecting server:', error);
    process.exit(1);
  });
} else if (isCliEnabled) {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    if (connectionManager) {
      connectionManager.close();
    }
    process.exit(1);
  });
}

export { parseArgv, validateConfig };
