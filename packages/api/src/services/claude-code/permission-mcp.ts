/**
 * Permission MCP bridge — a minimal stdio JSON-RPC 2.0 server that exposes
 * a single `request_permission` tool back to the Claude Code CLI.
 *
 * This file is *self-contained*: the service spawns it as a standalone Node
 * script via `--mcp-config`, so it cannot import from the rest of the API
 * codebase. Communication with the parent API process goes through a Unix
 * domain socket whose path is injected via the `AB_PERMISSION_SOCKET` env
 * var. The turn id is injected via `AB_TURN_ID`.
 *
 * Protocol surface we implement:
 *   - `initialize`
 *   - `tools/list`
 *   - `tools/call`  (only for tool name `request_permission`)
 *
 * Return contract for `tools/call`:
 *   { content: [{ type: 'text', text: JSON.stringify({ behavior, updatedInput?, message? }) }] }
 *
 * This shape matches Claude Code's `--permission-prompt-tool` expectation —
 * the CLI parses the first text block as JSON with `{ behavior: 'allow' | 'deny',
 * updatedInput?, message? }`. We confirmed the shape against the CLI flag
 * docs; see the plan for provenance.
 */
import * as net from 'node:net';
import * as readline from 'node:readline';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function writeResponse(resp: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(resp)}\n`);
}

function logStderr(msg: string): void {
  process.stderr.write(`[permission-mcp] ${msg}\n`);
}

const SOCKET_PATH = process.env.AB_PERMISSION_SOCKET;
const TURN_ID = process.env.AB_TURN_ID;

if (!SOCKET_PATH || !TURN_ID) {
  logStderr('missing AB_PERMISSION_SOCKET or AB_TURN_ID env var');
  process.exit(1);
}

/**
 * Ask the parent API process for a permission decision.
 * The parent listens on SOCKET_PATH and speaks a tiny line-delimited JSON
 * protocol: we send one JSON line with the request, it replies with one
 * JSON line with `{ decision, updatedInput?, message? }`.
 */
function askParent(payload: {
  turnId: string;
  toolName: string;
  toolInput: unknown;
  requestId: string;
}): Promise<{ decision: 'allow' | 'deny'; updatedInput?: unknown; message?: string }> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH as string, () => {
      client.write(`${JSON.stringify({ type: 'request_permission', ...payload })}\n`);
    });

    const rl = readline.createInterface({ input: client });
    let settled = false;

    rl.once('line', (line) => {
      if (settled) return;
      settled = true;
      try {
        const resp = JSON.parse(line);
        resolve(resp);
      } catch (err) {
        reject(err);
      } finally {
        client.end();
      }
    });

    client.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    client.once('close', () => {
      if (settled) return;
      settled = true;
      reject(new Error('permission-mcp socket closed before reply'));
    });
  });
}

const stdin = readline.createInterface({ input: process.stdin });

stdin.on('line', async (line: string) => {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line);
  } catch {
    logStderr(`failed to parse incoming line: ${line}`);
    return;
  }

  try {
    if (req.method === 'initialize') {
      writeResponse({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'agentbuddy-permission', version: '0.1.0' },
        },
      });
      return;
    }

    if (req.method === 'tools/list') {
      writeResponse({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            {
              name: 'request_permission',
              description:
                'Request approval from AgentBuddy for a Claude Code tool invocation.',
              inputSchema: {
                type: 'object',
                properties: {
                  tool_name: { type: 'string' },
                  input: { type: 'object' },
                },
                required: ['tool_name', 'input'],
              },
            },
          ],
        },
      });
      return;
    }

    if (req.method === 'tools/call') {
      const params = (req.params ?? {}) as {
        name?: string;
        arguments?: { tool_name?: string; input?: unknown };
      };

      if (params.name !== 'request_permission') {
        writeResponse({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Unknown tool: ${params.name}` },
        });
        return;
      }

      const toolName = params.arguments?.tool_name ?? 'unknown';
      const toolInput = params.arguments?.input ?? {};
      const requestId = `${TURN_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let decision: 'allow' | 'deny' = 'deny';
      let updatedInput: unknown | undefined;
      let message: string | undefined;
      try {
        const resp = await askParent({
          turnId: TURN_ID as string,
          toolName,
          toolInput,
          requestId,
        });
        decision = resp.decision === 'allow' ? 'allow' : 'deny';
        updatedInput = resp.updatedInput;
        message = resp.message;
      } catch (err) {
        logStderr(`parent dispatch failed: ${(err as Error).message}`);
        decision = 'deny';
        message = `AgentBuddy permission bridge error: ${(err as Error).message}`;
      }

      const payload: Record<string, unknown> = { behavior: decision };
      if (updatedInput !== undefined) payload.updatedInput = updatedInput;
      if (message !== undefined) payload.message = message;

      writeResponse({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          isError: decision === 'deny',
        },
      });
      return;
    }

    // Notifications (no id) — ignore silently.
    if (req.id === undefined) return;

    writeResponse({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` },
    });
  } catch (err) {
    logStderr(`handler error: ${(err as Error).message}`);
    if (req?.id !== undefined) {
      writeResponse({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32603, message: (err as Error).message },
      });
    }
  }
});

stdin.on('close', () => {
  process.exit(0);
});
