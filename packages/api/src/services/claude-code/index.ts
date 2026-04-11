/**
 * claudeCodeService — thin service that wraps the `claude` CLI as a
 * spawn-per-turn subprocess and maintains per-thread session records.
 *
 * Public surface follows `packages/api/src/services/cli.ts` in shape.
 *
 * IMPORTANT: qx/tx helpers are synchronous; this file must not `await` them.
 */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execSync } from 'node:child_process';
import { EARS } from '@/core/types';
import { repository } from '@/repository';
import { createLogger } from '@/core/helpers/debug/logger';
import {
  createSession as repoCreateSession,
  findByThreadId as repoFindByThreadId,
  attachCliSessionId as repoAttachCliSessionId,
  touch as repoTouchSession,
  type ClaudeCodeSessionRecord,
  type CreateSessionInput,
} from './repository';
import { runTurn as runnerRunTurn, type RunnerHandle } from './runner';

const logger = createLogger('claude-code');

/**
 * MCP-wire shape for a permission decision. This is the minimal shape the
 * permission MCP bridge needs to return to the Claude Code CLI.
 */
export type PermissionDecision = {
  decision: 'allow' | 'deny';
  updatedInput?: unknown;
  message?: string;
};

/**
 * UI-shape for a permission decision. The Resolve Claude Code Permission
 * action carries this from the frontend; the per-turn action is responsible
 * for translating it into a `PermissionDecision` before the MCP bridge sees
 * it.
 */
export type PermissionUiDecision = {
  decision: 'allow' | 'allow_session' | 'deny';
  scope?: string;
};

export interface PermissionRequest {
  turnId: string;
  requestId: string;
  toolName: string;
  toolInput: unknown;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (err: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  // biome-ignore lint/style/noNonNullAssertion: assigned below synchronously
  let resolve!: (v: T) => void;
  // biome-ignore lint/style/noNonNullAssertion: assigned below synchronously
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface PendingPermission {
  deferred: Deferred<PermissionUiDecision>;
  turnId: string;
  request: PermissionRequest;
}

interface ActiveTurn {
  turnId: string;
  threadId: EARS.EntityId;
  handle: RunnerHandle;
  socketPath: string;
  socketServer: net.Server;
  pendingRequestIds: Set<string>;
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionDecision>;
}

interface RunTurnArgs {
  session: ClaudeCodeSessionRecord;
  text: string;
}

interface RunTurnCallbacks {
  onEvent: (event: unknown) => void;
  onPermissionRequest: (req: PermissionRequest) => Promise<PermissionDecision>;
  onSessionIdCaptured: (sessionId: string) => void;
  onStderr?: (chunk: string) => void;
}

interface RunTurnResult {
  usage?: unknown;
  totalCostUsd?: number;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
}

export interface ClaudeCodeService {
  resolveBinary(): string;
  createSession(
    threadId: EARS.EntityId,
    opts: Omit<CreateSessionInput, 'threadId'>,
  ): ClaudeCodeSessionRecord;
  getSession(threadId: EARS.EntityId): ClaudeCodeSessionRecord | null;
  attachSessionId(threadId: EARS.EntityId, cliSessionId: string): void;
  runTurn(args: RunTurnArgs, cb: RunTurnCallbacks): Promise<RunTurnResult>;
  cancelActiveTurn(threadId: EARS.EntityId): void;
  pendingPermissions: {
    register(requestId: string, pending: PendingPermission): void;
    resolve(requestId: string, decision: PermissionUiDecision): void;
    rejectAllForTurn(turnId: string): void;
  };
}

/**
 * Resolve the absolute path to a runnable `permission-mcp.cjs` script.
 *
 * Complication: the API package ships with `"type": "module"` but `tsc`
 * emits CommonJS, so loading the raw `permission-mcp.js` as a node script
 * fails (node treats `.js` in an ESM package as ESM). To sidestep this, we
 * materialize the compiled script into a stable tempdir, write a sibling
 * `package.json` that pins `"type": "commonjs"`, and spawn from there.
 *
 * The materialization happens lazily on first call and is cached; the
 * tempdir is cleaned up on process exit. If the compiled source can't be
 * located the function throws — the runner surfaces the error upward.
 */
let cachedMcpScriptPath: string | null = null;

function resolvePermissionMcpScriptPath(): string {
  if (cachedMcpScriptPath) return cachedMcpScriptPath;

  // Possible locations for the tsc-compiled source.
  const candidates = [
    path.join(__dirname, 'permission-mcp.js'),
    path.join(__dirname, 'services', 'claude-code', 'permission-mcp.js'),
    path.join(path.dirname(__dirname), 'services', 'claude-code', 'permission-mcp.js'),
  ];
  let source: string | null = null;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        source = fs.readFileSync(p, 'utf8');
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!source) {
    throw new Error(
      'Claude Code permission-mcp.js not found in any known build location. Run `npm run build:be`.',
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-cc-mcp-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }),
    'utf8',
  );
  const scriptPath = path.join(tmpDir, 'permission-mcp.cjs');
  fs.writeFileSync(scriptPath, source, 'utf8');

  // Best-effort cleanup on exit.
  const cleanup = () => {
    try {
      fs.unlinkSync(scriptPath);
      fs.unlinkSync(path.join(tmpDir, 'package.json'));
      fs.rmdirSync(tmpDir);
    } catch {
      // ignore
    }
  };
  process.once('exit', cleanup);

  cachedMcpScriptPath = scriptPath;
  return scriptPath;
}

function createClaudeCodeService(): ClaudeCodeService {
  const activeTurns = new Map<string, ActiveTurn>(); // key: threadId
  const pendingByRequestId = new Map<string, PendingPermission>();
  const pendingByTurnId = new Map<string, Set<string>>();

  const pendingPermissions = {
    register(requestId: string, pending: PendingPermission) {
      pendingByRequestId.set(requestId, pending);
      let set = pendingByTurnId.get(pending.turnId);
      if (!set) {
        set = new Set();
        pendingByTurnId.set(pending.turnId, set);
      }
      set.add(requestId);
    },
    resolve(requestId: string, decision: PermissionDecision) {
      const pending = pendingByRequestId.get(requestId);
      if (!pending) return;
      pendingByRequestId.delete(requestId);
      const set = pendingByTurnId.get(pending.turnId);
      if (set) {
        set.delete(requestId);
        if (set.size === 0) pendingByTurnId.delete(pending.turnId);
      }
      pending.deferred.resolve(decision);
    },
    rejectAllForTurn(turnId: string) {
      const set = pendingByTurnId.get(turnId);
      if (!set) return;
      for (const requestId of Array.from(set)) {
        const pending = pendingByRequestId.get(requestId);
        if (!pending) continue;
        pendingByRequestId.delete(requestId);
        pending.deferred.resolve({ decision: 'deny' });
      }
      pendingByTurnId.delete(turnId);
    },
  };

  function resolveBinary(): string {
    // Settings override, else PATH lookup.
    const settings = repository.settingsQueries.getPluginSettings('claudeCode') as
      | { binaryPath?: string }
      | undefined;
    const fromSettings = settings?.binaryPath?.trim();
    if (fromSettings) return fromSettings;

    const cliPaths = repository.settingsQueries.getGeneralSettings()?.secrets?.cliPaths;
    const fromGeneral = cliPaths?.['claude-code']?.trim();
    if (fromGeneral) return fromGeneral;

    try {
      const resolved = execSync('command -v claude', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (resolved) return resolved;
    } catch {
      // fall through
    }
    throw new Error(
      'Claude Code binary not found. Install it from https://docs.claude.com/en/docs/claude-code and ensure `claude` is on your PATH, or set the path explicitly in settings.',
    );
  }

  function createSession(
    threadId: EARS.EntityId,
    opts: Omit<CreateSessionInput, 'threadId'>,
  ): ClaudeCodeSessionRecord {
    return repoCreateSession({ threadId, ...opts });
  }

  function getSession(threadId: EARS.EntityId): ClaudeCodeSessionRecord | null {
    return repoFindByThreadId(threadId);
  }

  function attachSessionId(threadId: EARS.EntityId, cliSessionId: string): void {
    const session = repoFindByThreadId(threadId);
    if (!session) return;
    repoAttachCliSessionId(session.id, cliSessionId);
  }

  function startPermissionSocketServer(
    turnId: string,
    onRequest: (req: PermissionRequest) => Promise<PermissionDecision>,
  ): { server: net.Server; socketPath: string } {
    const socketPath = path.join(
      os.tmpdir(),
      `ab-perm-${turnId}-${Date.now()}.sock`,
    );
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // not present
    }

    const server = net.createServer((client) => {
      const rl = readline.createInterface({ input: client });
      rl.once('line', async (line) => {
        let msg: {
          type?: string;
          turnId?: string;
          toolName?: string;
          toolInput?: unknown;
          requestId?: string;
        };
        try {
          msg = JSON.parse(line);
        } catch {
          client.end();
          return;
        }
        if (msg.type !== 'request_permission' || !msg.requestId) {
          client.end();
          return;
        }

        try {
          const decision = await onRequest({
            turnId: msg.turnId ?? turnId,
            requestId: msg.requestId,
            toolName: msg.toolName ?? 'unknown',
            toolInput: msg.toolInput,
          });
          client.write(`${JSON.stringify(decision)}\n`);
        } catch (err) {
          client.write(
            `${JSON.stringify({ decision: 'deny', message: (err as Error).message })}\n`,
          );
        } finally {
          client.end();
        }
      });
      client.on('error', () => {
        /* ignore */
      });
    });

    server.listen(socketPath);
    return { server, socketPath };
  }

  async function runTurn(args: RunTurnArgs, cb: RunTurnCallbacks): Promise<RunTurnResult> {
    const session = args.session;
    const threadId = session.threadId;
    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { server: socketServer, socketPath: permissionSocketPath } = startPermissionSocketServer(
      turnId,
      cb.onPermissionRequest,
    );

    const binary = resolveBinary();
    const permissionMcpScriptPath = resolvePermissionMcpScriptPath();

    let sessionIdCaptured = false;
    let lastUsage: unknown;
    let lastCost: number | undefined;

    const dispatchEvent = (event: unknown) => {
      if (event && typeof event === 'object') {
        const ev = event as Record<string, unknown>;
        if (!sessionIdCaptured && ev.type === 'system' && ev.subtype === 'init') {
          const sessionId = (ev.session_id ?? ev.sessionId) as string | undefined;
          if (sessionId) {
            sessionIdCaptured = true;
            try {
              cb.onSessionIdCaptured(sessionId);
            } catch (err) {
              logger.warn('onSessionIdCaptured threw', { error: (err as Error).message });
            }
          }
        }
        if (ev.type === 'result') {
          lastUsage = ev.usage;
          const c = (ev.total_cost_usd ?? ev.totalCostUsd) as number | undefined;
          if (typeof c === 'number') lastCost = c;
        }
      }
      try {
        cb.onEvent(event);
      } catch (err) {
        logger.warn('onEvent threw', { error: (err as Error).message });
      }
    };

    const handle = runnerRunTurn(
      {
        binary,
        cwd: session.cwd,
        turnId,
        text: args.text,
        resumeSessionId: session.cliSessionId,
        model: session.model,
        appendSystemPrompt: session.appendSystemPrompt,
        permissionMode: session.permissionMode,
        addDirs: session.addDirs,
        permissionMcpScriptPath,
        permissionSocketPath,
      },
      {
        onEvent: dispatchEvent,
        onStderr: cb.onStderr,
      },
    );

    const active: ActiveTurn = {
      turnId,
      threadId,
      handle,
      socketPath: permissionSocketPath,
      socketServer,
      pendingRequestIds: new Set(),
      onPermissionRequest: cb.onPermissionRequest,
    };
    activeTurns.set(threadId, active);

    const exit = await handle.done;

    // Drain any still-pending permission requests.
    pendingPermissions.rejectAllForTurn(turnId);

    // Close the socket server.
    try {
      socketServer.close();
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(permissionSocketPath);
    } catch {
      // ignore
    }

    activeTurns.delete(threadId);

    // Update session bookkeeping.
    try {
      repoTouchSession(session.id);
    } catch (err) {
      logger.warn('touch session failed', { error: (err as Error).message });
    }

    return {
      usage: lastUsage,
      totalCostUsd: lastCost,
      exitCode: exit.code,
      exitSignal: exit.signal,
    };
  }

  function cancelActiveTurn(threadId: EARS.EntityId): void {
    const active = activeTurns.get(threadId);
    if (!active) return;
    active.handle.cancel();
  }

  return {
    resolveBinary,
    createSession,
    getSession,
    attachSessionId,
    runTurn,
    cancelActiveTurn,
    pendingPermissions,
  };
}

export const claudeCodeService: ClaudeCodeService = createClaudeCodeService();

export type { ClaudeCodeSessionRecord } from './repository';
