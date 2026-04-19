/**
 * CC: Run Command — unified dispatcher for all /cc-* chat commands.
 *
 * Strips the `cc-` prefix, looks up a handler in the registry, and sends
 * the result to chat. Adding a new cc- command = add a handler function +
 * register it in the `handlers` map. No flow changes needed.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: Run Command',
  description: 'Unified dispatcher for cc- prefixed chat commands',
  category: 'claude-code',
  input: {
    command: { type: 'string', description: 'Full command name (e.g. cc-sessions)', required: true },
    text: { type: 'string', description: 'Arguments after the command', required: false },
    threadId: { type: 'string', description: 'Thread ID for response', required: false },
  },
};

type Handler = (
  args: string[],
  services: Services,
) => Promise<{ text: string; data?: any }>;

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  sessions: handleSessions,
  config: handleConfig,
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
      result = await handler(args, services);
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
