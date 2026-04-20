/**
 * CC: Run Command — unified dispatcher for all /cc-* chat commands.
 *
 * Strips the `cc-` prefix, looks up a handler in the registry, and sends
 * the result to chat. Adding a new cc- command = add a handler function +
 * register it in the `handlers` map. No flow changes needed.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getClaudeState } from './_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'CC: Run Command',
  description: 'Unified dispatcher for cc- prefixed chat commands',
  category: 'claude-code',
  input: {
    command: { type: 'string', description: 'Full command name (e.g. cc-sessions)', required: true },
    text: { type: 'string', description: 'Arguments after the command', required: false },
    threadId: { type: 'string', description: 'Thread ID for response', required: false },
    references: { type: 'object', description: 'Attached references (images, files, context)', required: false },
  },
};

type Handler = (
  args: string[],
  services: Services,
  threadId?: string,
) => Promise<{ text: string; data?: any }>;

// ── Passthrough commands ─────────────────────────────────────────────
// Commands that map directly to `claude <subcommand> [...args]` and
// relay stdout. Only commands registered as top-level CLI subcommands
// (via Commander.js in main.tsx) work here — REPL-only slash commands
// need dedicated handlers instead.

const PASSTHROUGH: Record<string, { cmd: string; defaultArgs?: string[] }> = {
  doctor: { cmd: 'doctor' },
  mcp:    { cmd: 'mcp', defaultArgs: ['list'] },
  agents: { cmd: 'agents' },
};

function makePassthroughHandler(spec: { cmd: string; defaultArgs?: string[] }): Handler {
  return async (args, services) => {
    const fullArgs = [spec.cmd, ...(args.length > 0 ? args : spec.defaultArgs ?? [])];
    const result = await services.cli.claudeCode.exec(fullArgs);
    const output = (result.stdout + result.stderr).trim();
    return { text: output || `(no output from cc-${spec.cmd})` };
  };
}

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  sessions: handleSessions,
  config: handleConfig,
  context: handleContext,
  status: handleStatus,
  model: handleModel,
  memory: handleMemory,
  skills: handleSkills,
  tasks: handleTasks,
  stats: handleStats,
  // Passthrough commands — exec and relay stdout
  ...Object.fromEntries(
    Object.entries(PASSTHROUGH).map(([name, spec]) => [name, makePassthroughHandler(spec)]),
  ),
};

// ── Dispatcher ──────────────────────────────────────────────────────

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { command, text, threadId } = params;
  const name = (command as string).replace(/^cc-/, '');
  const args = text?.trim() ? text.trim().split(/\s+/) : [];

  const handler = handlers[name];

  let result: { text: string; data?: any };

  if (handler) {
    try {
      result = await handler(args, services, threadId);
    } catch (error: any) {
      result = { text: `cc-${name} failed: ${error?.message || 'Unknown error'}` };
    }
  } else {
    const available = Object.keys(handlers).map(k => `cc-${k}`).join(', ');
    result = { text: `Unknown command: cc-${name}\nAvailable: ${available}` };
  }

  if (threadId) {
    services.chat.sendBlockMessage({
      threadId,
      text: result.text,
      blocks: [],
    });
  }

  return { success: !!handler, command: `cc-${name}`, ...result };
}

// ── Handlers ────────────────────────────────────────────────────────

async function handleSessions(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [sessionId] = args;

  if (sessionId) {
    const entries = await services.cli.claudeCode.viewSession(sessionId);
    const summary = entries
      .filter(e => e.type === 'human' || e.type === 'assistant')
      .slice(0, 10)
      .map(e => `[${e.type}] ${typeof e.message === 'string' ? e.message : JSON.stringify(e.message)}`)
      .join('\n');
    return {
      text: summary || `Session ${sessionId}: no messages found`,
      data: entries,
    };
  }

  const sessions = await services.cli.claudeCode.listSessions();
  if (!sessions.length) {
    return { text: 'No sessions found.' };
  }
  const lines = sessions.map(s => {
    const title = s.title || '(untitled)';
    const date = s.modifiedAt ? new Date(s.modifiedAt).toLocaleDateString() : '';
    return `${s.id}  ${title}  ${date}`;
  });
  return { text: lines.join('\n'), data: sessions };
}

async function handleConfig(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [subcommand, key, ...rest] = args;

  if (!subcommand) {
    return { text: 'Usage: /cc-config get <key> | set <key> <value> | sources' };
  }

  switch (subcommand) {
    case 'get': {
      if (!key) return { text: 'Usage: /cc-config get <key>' };
      const result = await services.cli.claudeCode.exec(['config', 'get', key]);
      return { text: result.stdout.trim() || `(no value for "${key}")` };
    }
    case 'set': {
      if (!key || !rest.length) return { text: 'Usage: /cc-config set <key> <value>' };
      const value = rest.join(' ');
      const result = await services.cli.claudeCode.exec(['config', 'set', key, value]);
      return { text: result.stdout.trim() || `Set ${key} = ${value}` };
    }
    case 'sources': {
      const result = await services.cli.claudeCode.exec(['config', 'sources', '--json']);
      return { text: result.stdout.trim() || 'No config sources', data: result.stdout };
    }
    default:
      return { text: `Unknown config subcommand: ${subcommand}\nUsage: /cc-config get <key> | set <key> <value> | sources` };
  }
}

async function handleContext(
  _args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const sessionId = getClaudeState(services, threadId)?.sessionId;
  if (!sessionId) return { text: 'No active session — run a Claude Code turn first.' };

  // Resume the session with /context as the prompt. The CLI processes it
  // as a slash command and returns the markdown table without invoking the model.
  const handle = await services.cli.claudeCode.query({
    prompt: '/context',
    resume: sessionId,
    maxTurns: 1,
    permissionMode: 'plan',
    noSessionPersistence: true,
  });

  const result = await handle.result;
  return { text: result.text || '(no context data)', data: result };
}

async function handleStatus(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [version, auth] = await Promise.all([
    services.cli.claudeCode.version(),
    services.cli.claudeCode.authStatus(),
  ]);
  const lines = [
    `Version: ${version.trim()}`,
    `Auth: ${auth.authenticated ? 'authenticated' : 'not authenticated'}`,
  ];
  if (auth.account) lines.push(`Account: ${JSON.stringify(auth.account)}`);
  return { text: lines.join('\n'), data: { version, auth } };
}

async function handleModel(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  if (args.length === 0) {
    const result = await services.cli.claudeCode.exec(['config', 'get', 'model']);
    return { text: result.stdout.trim() || '(using default model)' };
  }
  await services.cli.claudeCode.exec(['config', 'set', 'model', args[0]]);
  return { text: `Model set to: ${args[0]}` };
}

async function handleMemory(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  if (args[0] === 'add' && args[1]) {
    const result = await services.cli.claudeCode.exec(['memory', 'add', args[1]]);
    return { text: result.stdout.trim() || `Added memory file: ${args[1]}` };
  }
  if (args[0] === 'remove' && args[1]) {
    const result = await services.cli.claudeCode.exec(['memory', 'remove', args[1]]);
    return { text: result.stdout.trim() || `Removed memory file: ${args[1]}` };
  }
  const result = await services.cli.claudeCode.exec(['memory', 'list', '--json']);
  const output = result.stdout.trim();
  if (!output) return { text: 'No memory files found.' };
  try {
    const files = JSON.parse(output);
    const lines = files.map((f: any) => {
      const scope = f.scope ? ` [${f.scope}]` : '';
      return `${f.name}${scope}${f.path ? `  ${f.path}` : ''}`;
    });
    return { text: lines.join('\n'), data: files };
  } catch {
    return { text: output };
  }
}

async function handleSkills(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const result = await services.cli.claudeCode.exec(['skills', 'list', '--json']);
  const output = result.stdout.trim();
  if (!output) return { text: 'No skills installed.' };
  try {
    const skills = JSON.parse(output);
    if (!skills.length) return { text: 'No skills installed.' };
    const lines = skills.map((s: any) => {
      const status = s.enabled === false ? ' (disabled)' : '';
      const scope = s.scope ? ` [${s.scope}]` : '';
      return `${s.name}${status}${scope}`;
    });
    return { text: lines.join('\n'), data: skills };
  } catch {
    return { text: output };
  }
}

async function handleTasks(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const result = await services.cli.claudeCode.exec(['task', 'list', '--json']);
  const output = result.stdout.trim();
  if (!output) return { text: 'No tasks found.' };
  try {
    const tasks = JSON.parse(output);
    if (!tasks.length) return { text: 'No tasks found.' };
    const lines = tasks.map((t: any) => {
      const status = t.status ? ` [${t.status}]` : '';
      return `${t.id}  ${t.subject || '(untitled)'}${status}`;
    });
    return { text: lines.join('\n'), data: tasks };
  } catch {
    return { text: output };
  }
}

async function handleStats(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [version, auth, sourcesResult] = await Promise.all([
    services.cli.claudeCode.version(),
    services.cli.claudeCode.authStatus(),
    services.cli.claudeCode.exec(['config', 'sources', '--json']),
  ]);
  const lines = [
    `Version: ${version.trim()}`,
    `Auth: ${auth.authenticated ? 'authenticated' : 'not authenticated'}`,
  ];
  try {
    const sources = JSON.parse(sourcesResult.stdout.trim());
    lines.push(`Config sources: ${sources.sources?.length ?? 0}`);
  } catch { /* ignore parse failures */ }
  return { text: lines.join('\n'), data: { version, auth } };
}
