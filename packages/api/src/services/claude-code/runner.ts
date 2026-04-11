/**
 * Claude Code CLI runner — spawns the `claude` binary in stream-json mode
 * for a single turn and wires stdout NDJSON into a callback stream.
 *
 * One `runTurn` invocation == one subprocess (spawn-per-turn model).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

export interface RunnerTurnOptions {
  binary: string;
  cwd: string;
  turnId: string;
  text: string;
  resumeSessionId?: string;
  model?: string;
  appendSystemPrompt?: string;
  permissionMode?: string;
  addDirs?: string[];
  /**
   * Absolute path to the compiled `permission-mcp.js` that will be spawned
   * by the CLI via `--mcp-config`.
   */
  permissionMcpScriptPath: string;
  /**
   * Path to the Unix domain socket the parent API process is listening on
   * for permission decisions.
   */
  permissionSocketPath: string;
  /** Optional extra env applied to the child. */
  extraEnv?: Record<string, string>;
}

export interface RunnerHandle {
  /** Child process (for diagnostics only — callers should prefer `cancel()`). */
  child: ChildProcessWithoutNullStreams;
  /** Promise that resolves when the child exits cleanly. */
  done: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** SIGINT, then SIGTERM after 2s, then SIGKILL after a further 2s. */
  cancel: () => void;
}

export interface RunnerCallbacks {
  onEvent: (event: unknown) => void;
  onStderr?: (chunk: string) => void;
}

/**
 * Build the argv for a `claude --print` stream-json turn, following the
 * flags documented by `claude --help`. This list is intentionally minimal:
 * anything optional is only included when provided.
 */
export function buildArgs(opts: RunnerTurnOptions): string[] {
  const args: string[] = [
    '--print',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--replay-user-messages',
    '--permission-prompt-tool',
    'mcp__agentbuddy__request_permission',
  ];

  if (opts.resumeSessionId) {
    args.push('--resume', opts.resumeSessionId);
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }
  if (opts.permissionMode) {
    args.push('--permission-mode', opts.permissionMode);
  }
  if (opts.appendSystemPrompt) {
    args.push('--append-system-prompt', opts.appendSystemPrompt);
  }
  if (opts.addDirs && opts.addDirs.length) {
    for (const dir of opts.addDirs) {
      args.push('--add-dir', dir);
    }
  }

  // --mcp-config needs a JSON file path. Caller passes it via extraEnv.
  // We materialize it here so we keep the tempfile lifecycle in one place.
  return args;
}

/**
 * Write a per-turn `permission-mcp.json` config and return its path.
 * Caller is responsible for deleting it after the subprocess exits.
 */
export function writeMcpConfig(opts: RunnerTurnOptions): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ab-cc-turn-${opts.turnId}-`));
  const configPath = path.join(tmpDir, 'permission-mcp.json');
  const body = {
    mcpServers: {
      agentbuddy: {
        type: 'stdio',
        command: process.execPath, // node
        args: [opts.permissionMcpScriptPath],
        env: {
          AB_PERMISSION_SOCKET: opts.permissionSocketPath,
          AB_TURN_ID: opts.turnId,
        },
      },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(body), 'utf8');
  return configPath;
}

/**
 * Spawn the claude subprocess for a single turn, pipe one SDKUserMessage into
 * stdin, parse stdout as NDJSON and dispatch to `cb.onEvent`.
 */
export function runTurn(
  opts: RunnerTurnOptions,
  cb: RunnerCallbacks,
): RunnerHandle {
  const mcpConfigPath = writeMcpConfig(opts);

  const args = buildArgs(opts);
  args.push('--mcp-config', mcpConfigPath);

  const child = spawn(opts.binary, args, {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...(opts.extraEnv || {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  // Write a single SDKUserMessage NDJSON line to stdin then close.
  //
  // The Claude Code CLI expects a message object matching the Anthropic
  // messages SDK shape — wrapped in `{ type: 'user', message: { ... } }`.
  // Minimal form is `content` as a single text block.
  const userMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: opts.text }],
    },
  };
  try {
    child.stdin.write(`${JSON.stringify(userMessage)}\n`);
    child.stdin.end();
  } catch {
    // Subprocess may have exited already; ignore.
  }

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      cb.onEvent(parsed);
    } catch {
      // Malformed line — ignore (CLI may emit non-JSON warnings in rare cases).
    }
  });

  if (cb.onStderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      // biome-ignore lint/style/noNonNullAssertion: callback is guarded above
      cb.onStderr!(chunk.toString('utf8'));
    });
  }

  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => {
      try {
        fs.unlinkSync(mcpConfigPath);
        fs.rmdirSync(path.dirname(mcpConfigPath));
      } catch {
        // Best effort cleanup.
      }
      resolve({ code, signal });
    });
  });

  let escalateTimer: NodeJS.Timeout | null = null;
  let killTimer: NodeJS.Timeout | null = null;
  const cancel = () => {
    if (child.exitCode !== null) return;
    try {
      child.kill('SIGINT');
    } catch {
      // ignore
    }
    escalateTimer = setTimeout(() => {
      if (child.exitCode !== null) return;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      killTimer = setTimeout(() => {
        if (child.exitCode !== null) return;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2000);
    }, 2000);
  };

  done.then(() => {
    if (escalateTimer) clearTimeout(escalateTimer);
    if (killTimer) clearTimeout(killTimer);
  });

  return { child, done, cancel };
}
