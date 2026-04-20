/**
 * CC: Run Command — unified dispatcher for all /cc-* chat commands.
 *
 * Strips the `cc-` prefix, looks up a handler in the registry, and sends
 * the result to chat. Adding a new cc- command = add a handler function +
 * register it in the `handlers` map. No flow changes needed.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { getClaudeState, persistClaudeState, setProjectDirectory } from './_helpers/thread-context';
import { updateChatState, updateSessionArtifact, ensureSessionArtifact } from './_helpers/session-artifact';

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

// ── Helpers ─────────────────────────────────────────────────────────

/** Rejoin args (split by dispatcher) into a single path, stripping flags and trailing slashes. */
function parseDirPath(args: string[]): string {
  return args.filter(a => !a.startsWith('--')).join(' ').replace(/\/+$/, '');
}

/** Shorten a path to at most the last 2 segments for display. */
function shortenPath(p: string): string {
  const s = p.split('/').filter(Boolean);
  return s.length <= 2 ? p : `…/${s.slice(-2).join('/')}`;
}

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  sessions: handleSessions,
  config: handleConfig,
  context: handleContext,
  status: handleStats,
  model: handleModel,
  memory: handleMemory,
  skills: handleSkills,
  compact: handleCompact,
  resume: handleResume,
  import: handleImport,
  'add-dir': handleAddDir,
  'set-dir': handleSetDir,
  fork: handleFork,
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

  let result: { text: string; data?: any; blocks?: any[]; skipMessage?: boolean };

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

  if (threadId && !result.skipMessage) {
    services.chat.sendBlockMessage({
      threadId,
      text: result.text,
      blocks: result.blocks ?? [],
    });
  }

  return { success: !!handler, command: `cc-${name}`, text: result.text, data: result.data };
}

// ── Handlers ────────────────────────────────────────────────────────

async function handleSessions(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any; blocks?: any[] }> {
  const [sessionId] = args;

  if (sessionId) {
    const entries = await services.cli.claudeCode.viewSession(sessionId);
    const summary = entries
      .filter(e => e.type === 'user' || e.type === 'assistant')
      .slice(0, 10)
      .map(e => `[${e.type}] ${typeof e.message === 'string' ? e.message : JSON.stringify(e.message)}`)
      .join('\n');
    return {
      text: summary || `Session ${sessionId}: no messages found`,
      data: entries,
    };
  }

  const sessions = await services.cli.claudeCode.listSessions();
  if (!sessions.length) return { text: 'No sessions found.' };

  const items = sessions.map(s => ({
    id: s.id,
    title: s.title || '(untitled)',
    modifiedAt: s.modifiedAt ? new Date(s.modifiedAt).toISOString() : '',
    size: s.size ?? 0,
  }));

  return {
    text: `${sessions.length} sessions`,
    blocks: [{ type: 'session-list', props: { sessions: items } }],
    data: sessions,
  };
}

async function handleConfig(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [subcommand, key, ...rest] = args;

  if (!subcommand) {
    return { text: 'Usage: /cc-config get <key> | set <key> <value>' };
  }

  const settings = await services.cli.claudeCode.readSettings();

  switch (subcommand) {
    case 'get': {
      if (!key) return { text: 'Usage: /cc-config get <key>' };
      const value = settings[key];
      if (value === undefined) return { text: `(no value for "${key}")` };
      const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      return { text: display, data: value };
    }
    case 'set': {
      if (!key || !rest.length) return { text: 'Usage: /cc-config set <key> <value>' };
      const raw = rest.join(' ');
      let parsed: any = raw;
      try { parsed = JSON.parse(raw); } catch { /* keep as string */ }
      settings[key] = parsed;
      await services.cli.claudeCode.writeSettings(settings);
      return { text: `Set ${key} = ${raw}` };
    }
    default:
      return { text: `Unknown config subcommand: ${subcommand}\nUsage: /cc-config get <key> | set <key> <value>` };
  }
}

async function handleContext(
  _args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; blocks?: any[] }> {
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
  const md = result.text || '';
  const parsed = parseContextMarkdown(md);

  if (parsed) {
    return {
      text: 'Context usage',
      blocks: [{ type: 'context-usage', props: { data: parsed } }],
      data: parsed,
    };
  }

  return { text: md || '(no context data)' };
}

async function handleCompact(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; skipMessage?: boolean }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const sessionId = getClaudeState(services, threadId)?.sessionId;
  if (!sessionId) return { text: 'No active session — run a Claude Code turn first.' };

  updateChatState(services, threadId as any, 'working');
  try {
    const prompt = args.length > 0 ? `/compact ${args.join(' ')}` : '/compact';
    const handle = await services.cli.claudeCode.query({
      prompt,
      resume: sessionId,
      permissionMode: 'plan',
    });

    const result = await handle.result;
    const summaryText = result.text || 'Session compacted.';

    // Create a marker message that compacts eligible prior messages
    // (repository filters out markers and already-compacted messages)
    const { compactedMessageIds } = services.chat.createMarkerMessage({
      threadId: threadId as any,
      text: summaryText,
    });

    return { text: summaryText, skipMessage: compactedMessageIds.length > 0 };
  } finally {
    updateChatState(services, threadId as any, 'idle');
  }
}

async function handleAddDir(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!args.length) return { text: 'Usage: /cc-add-dir <path> [--remember]' };

  const remember = args.includes('--remember');
  const dirPath = parseDirPath(args);
  if (!dirPath) return { text: 'Usage: /cc-add-dir <path> [--remember]' };

  // Session-scoped: store in thread context so it's passed via --add-dir on every query
  if (threadId) {
    const state = getClaudeState(services, threadId);
    const existing = state?.additionalDirs ?? [];
    if (!existing.includes(dirPath)) {
      persistClaudeState(services, threadId, {
        additionalDirs: [...existing, dirPath],
      });
      updateSessionArtifact(services, threadId as any, (prev: any) => ({
        additionalDirs: [...new Set([...(prev.additionalDirs ?? []), dirPath])],
      }));
    }
  }

  // Persistent: write to ~/.claude/settings.json
  if (remember) {
    const settings = await services.cli.claudeCode.readSettings();
    const perms = settings.permissions ?? {};
    const dirs: string[] = perms.additionalDirectories ?? [];
    if (!dirs.includes(dirPath)) {
      perms.additionalDirectories = [...dirs, dirPath];
      settings.permissions = perms;
      await services.cli.claudeCode.writeSettings(settings);
    }
  }

  const suffix = remember ? ' (remembered across sessions)' : ' (this session only)';
  return { text: `Added directory: ${dirPath}${suffix}` };
}

async function handleSetDir(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string }> {
  const dirPath = parseDirPath(args);
  if (!dirPath) return { text: 'Usage: /cc-set-dir <path>' };

  setProjectDirectory(services, dirPath);

  // If thread has an active session, create a new thread for the new directory
  if (threadId) {
    const state = getClaudeState(services, threadId);
    if (state?.sessionId) {
      const topic = `New session — ${shortenPath(dirPath)}`;
      const { id: newThreadId } = services.chat.createThreadAndNotify({
        topic,
        instructions: '',
      });
      services.chat.openThreadChatAndRefreshRecent(newThreadId as any);
      return { text: `Working directory set to: ${dirPath} (new thread created)` };
    }
  }

  return { text: `Working directory set to: ${dirPath}` };
}

async function handleFork(
  _args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; skipMessage?: boolean }> {
  if (!threadId) return { text: 'No active thread.' };

  const threadData = services.repository.chatQueries.threadData(threadId as any);
  const messages = (threadData?.messages ?? []) as any[];
  const lastAssistant = [...messages].reverse().find(m => m.sender === 'assistant');
  if (!lastAssistant?.id) return { text: 'No assistant message to fork from.' };

  const topic = threadData?.topic || 'Untitled';
  const forkCount = services.repository.threadCommands.forkCount(threadId as any);
  const forkTopic = `Fork ${forkCount + 1} - ${topic}`;

  const { id: newThreadId } = services.chat.createThreadAndNotify({ topic: forkTopic, instructions: '' });
  services.repository.threadCommands.linkFork(threadId as any, newThreadId);
  services.repository.chatCommands.copyMessagesUpTo({
    sourceThreadId: threadId as any,
    targetThreadId: newThreadId,
    upToMessageId: lastAssistant.id,
  });

  await services.action.getAndExecute('CC: Handle Fork', {
    sourceThreadId: threadId,
    sourceMessageId: lastAssistant.id,
    newThreadId,
  });

  services.chat.openThreadChatAndRefreshRecent(newThreadId);
  return { text: `Forked to: ${forkTopic}`, skipMessage: true };
}

async function handleModel(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const settings = await services.cli.claudeCode.readSettings();
  if (args.length === 0) {
    return { text: settings.model || '(using default model)' };
  }
  settings.model = args[0];
  await services.cli.claudeCode.writeSettings(settings);
  return { text: `Model set to: ${args[0]}` };
}

async function handleMemory(
  args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  if (args[0] === 'add' || args[0] === 'remove') {
    return { text: `Memory add/remove is only available in the Claude Code terminal. Use /memory ${args[0]} there.` };
  }
  const files = await services.cli.claudeCode.listMemoryFiles();
  if (!files.length) return { text: 'No memory files found.' };
  const lines = files.map((f: any) => {
    const scope = f.scope ? ` [${f.scope}]` : '';
    return `${f.name}${scope}  ${f.path}`;
  });
  return { text: lines.join('\n'), data: files };
}

async function handleSkills(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const skills = await services.cli.claudeCode.listSkills();
  if (!skills.length) return { text: 'No skills installed.' };
  const lines = skills.map((s: any) => {
    const scope = s.scope ? ` [${s.scope}]` : '';
    return `${s.name}${scope}`;
  });
  return { text: lines.join('\n'), data: skills };
}

async function handleStats(
  _args: string[],
  services: Services,
): Promise<{ text: string; data?: any }> {
  const [version, auth, settings] = await Promise.all([
    services.cli.claudeCode.version(),
    services.cli.claudeCode.authStatus(),
    services.cli.claudeCode.readSettings(),
  ]);
  const lines = [
    `Version: ${version.trim()}`,
    `Auth: ${auth.authenticated ? 'authenticated' : 'not authenticated'}`,
  ];
  if (settings.model) lines.push(`Model: ${settings.model}`);
  return { text: lines.join('\n'), data: { version, auth, settings } };
}

// ── Context markdown parser ─────────────────────────────────────────

function parseTokenCount(s: string): number {
  const trimmed = s.trim();
  const n = parseFloat(trimmed);
  if (trimmed.endsWith('k') || trimmed.endsWith('K')) return Math.round(n * 1000);
  if (trimmed.endsWith('M') || trimmed.endsWith('m')) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function parseContextMarkdown(md: string): any | null {
  if (!md) return null;

  const modelMatch = md.match(/\*\*Model:\*\*\s*(.+)/);
  const tokensMatch = md.match(/\*\*Tokens:\*\*\s*([\d,.]+[kKmM]?)\s*\/\s*([\d,.]+[kKmM]?)\s*\((\d+)%\)/);
  if (!tokensMatch) return null;

  // Parse category rows from the main table
  const categories: Array<{ name: string; tokens: number; percentage: number }> = [];
  const catRegex = /\|\s*([^|]+?)\s*\|\s*([\d,.]+[kKmM]?)\s*\|\s*([\d.]+)%\s*\|/g;
  let m;
  while ((m = catRegex.exec(md)) !== null) {
    const name = m[1].trim();
    if (name === 'Category' || name.startsWith('---')) continue;
    categories.push({ name, tokens: parseTokenCount(m[2]), percentage: parseFloat(m[3]) });
  }

  // Parse detail tables (Memory Files, Skills)
  const memoryFiles = parseDetailSection(md, 'Memory Files', ['type', 'path', 'tokens']);
  const skills = parseDetailSection(md, 'Skills', ['name', 'source', 'tokens']);

  return {
    model: modelMatch?.[1]?.trim() || '',
    totalTokens: parseTokenCount(tokensMatch[1]),
    maxTokens: parseTokenCount(tokensMatch[2]),
    percentage: parseInt(tokensMatch[3]),
    categories,
    memoryFiles: memoryFiles.length ? memoryFiles : undefined,
    skills: skills.length ? skills : undefined,
  };
}

function parseDetailSection(md: string, heading: string, columns: string[]): any[] {
  const sectionRegex = new RegExp(`### ${heading}[\\s\\S]*?(?=###|$)`);
  const section = md.match(sectionRegex)?.[0];
  if (!section) return [];

  const rows: any[] = [];
  const rowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let m;
  let skipCount = 0;
  while ((m = rowRegex.exec(section)) !== null) {
    // Skip header + separator rows
    if (skipCount < 2) { skipCount++; continue; }
    const entry: any = {};
    for (let i = 0; i < columns.length; i++) {
      const val = m[i + 1]?.trim() || '';
      entry[columns[i]] = columns[i] === 'tokens' ? parseTokenCount(val) : val;
    }
    rows.push(entry);
  }
  return rows;
}

// ── Resume ──────────────────────────────────────────────────────────

/**
 * Extract displayable text from a CLI transcript content array.
 * Skips tool_use / tool_result blocks; concatenates text blocks.
 */
function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b.type === 'text' && b.text)
    .map((b: any) => b.text)
    .join('\n');
}

/**
 * Parse a CLI session transcript and batch-import messages into a thread.
 * No per-message frontend events — caller must refresh the thread afterwards.
 */
function importSessionMessages(
  services: Services,
  threadId: string,
  transcript: any[],
): number {
  const messages: Array<{
    text: string;
    sender: 'user' | 'assistant';
    forkable?: boolean;
    context?: Record<string, unknown>;
  }> = [];

  for (const entry of transcript) {
    if (entry.type === 'user' && entry.message?.role === 'user') {
      const text = extractText(entry.message.content);
      if (!text) continue;
      messages.push({
        text,
        sender: 'user',
        forkable: false,
        ...(entry.uuid && { context: { cliUuid: entry.uuid } }),
      });
    } else if (entry.type === 'assistant') {
      const text = extractText(entry.message?.content) || '(tool use only)';
      messages.push({
        text,
        sender: 'assistant',
        forkable: true,
        ...(entry.uuid && { context: { cliUuid: entry.uuid } }),
      });
    }
  }

  if (messages.length > 0) {
    services.chat.addMessagesToThread({
      threadId: threadId as any,
      messages: messages as any,
    });
  }

  return messages.length;
}

async function handleResume(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; blocks?: any[]; skipMessage?: boolean }> {
  const [sessionId] = args;

  // No args: show session picker
  if (!sessionId) {
    const sessions = await services.cli.claudeCode.listSessions();
    if (!sessions.length) return { text: 'No sessions found.' };

    const items = sessions.map((s: any) => ({
      id: s.id,
      title: s.title || '(untitled)',
      modifiedAt: s.modifiedAt ? new Date(s.modifiedAt).toISOString() : '',
      size: s.size ?? 0,
    }));

    return {
      text: 'Pick a session to resume (use `/cc-resume <session-id>`):',
      blocks: [{ type: 'session-list', props: { sessions: items } }],
      data: sessions,
    };
  }

  // Validate session exists
  const sessions = await services.cli.claudeCode.listSessions();
  const session = sessions.find((s: any) => s.id === sessionId);
  if (!session) return { text: `Session not found: ${sessionId}` };

  if (!threadId) return { text: 'No active thread.' };

  // Fetch transcript for message import
  const transcript = await services.cli.claudeCode.viewSession(sessionId);

  // Determine target thread
  const existingMessages = services.repository.threadQueries.messages(threadId as any);
  const hasMessages = existingMessages && existingMessages.length > 0;
  let targetThreadId = threadId;

  if (hasMessages) {
    const title = (session as any).title || 'Resumed session';
    const { id: newThreadId } = services.chat.createThreadAndNotify({
      topic: title,
      instructions: '',
    });
    targetThreadId = newThreadId as string;
  }

  // Import messages from transcript (batch — no per-message events)
  const importedCount = importSessionMessages(services, targetThreadId, transcript);

  // Set up session state — persistClaudeState adds 'claude-session' tag
  persistClaudeState(services, targetThreadId, { sessionId });
  ensureSessionArtifact(services, targetThreadId as any, {
    sessionId,
    cwd: (session as any).cwd || '',
    chatState: 'idle',
  });

  // Build confirmation text
  const sessionTitle = (session as any).title || '(untitled)';
  const confirmText = `Session resumed: **${sessionTitle}** (${importedCount} messages imported)\nSend a message to continue.`;

  if (hasMessages) {
    // New thread: send confirmation there and navigate
    services.chat.sendBlockMessage({
      threadId: targetThreadId as any,
      text: confirmText,
      blocks: [],
    });
    services.chat.openThreadChatAndRefreshRecent(targetThreadId as any);
    return { text: confirmText, skipMessage: true };
  }

  // Same thread: reload thread data to show imported messages
  services.emitter.sendToPlugin('threads', {
    type: 'LOAD_CHAT_THREAD',
    data: services.repository.chatQueries.threadData(targetThreadId as any),
  });

  return { text: confirmText };
}

// ── Import ──────────────────────────────────────────────────────────

const DEFAULT_IMPORT_LIMIT = 250;

async function handleImport(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any; skipMessage?: boolean }> {
  const importAll = args.includes('all');
  const limit = importAll ? undefined : DEFAULT_IMPORT_LIMIT;

  // List available CLI sessions
  const sessions = await services.cli.claudeCode.listSessions(
    limit ? { limit } : undefined,
  );
  if (!sessions.length) return { text: 'No sessions found to import.' };

  // Build set of already-imported sessionIds to avoid duplicates
  const existingSessionIds = new Set<string>();
  for (const thread of services.repository.threadQueries.all()) {
    const sid = (thread as any)?.context?.claudeCode?.sessionId;
    if (sid) existingSessionIds.add(sid);
  }

  const toImport = sessions.filter((s: any) => !existingSessionIds.has(s.id));
  const alreadyImported = sessions.length - toImport.length;

  if (!toImport.length) {
    return { text: `All ${sessions.length} sessions are already imported.` };
  }

  if (!threadId) return { text: 'No active thread.' };

  // Send progress message
  const { messageId: progressMsgId } = services.chat.sendBlockMessage({
    threadId: threadId as any,
    text: `Importing ${toImport.length} sessions…`,
    blocks: [],
  });

  let imported = 0;
  let failed = 0;

  for (const session of toImport) {
    try {
      const transcript = await services.cli.claudeCode.viewSession(session.id);
      const title = (session as any).title || `Session ${session.id.slice(0, 8)}`;

      // Create thread directly (no per-thread frontend events)
      const { id: newThreadId } = services.repository.threadCommands.create({
        topic: title,
        instructions: '',
        tags: ['imported'],
      });

      // Import messages
      importSessionMessages(services, newThreadId as string, transcript);

      // Set up session state (adds 'claude-session' tag automatically)
      persistClaudeState(services, newThreadId as string, { sessionId: session.id });
      ensureSessionArtifact(services, newThreadId as any, {
        sessionId: session.id,
        cwd: (session as any).cwd || '',
        chatState: 'idle',
      });

      imported++;
    } catch {
      failed++;
    }
  }

  // Update progress message with final summary
  const parts = [`Imported ${imported} sessions.`];
  if (alreadyImported > 0) parts.push(`${alreadyImported} already imported.`);
  if (failed > 0) parts.push(`${failed} failed.`);
  const summary = parts.join(' ');

  services.chat.updateMessageState(progressMsgId as any, { text: summary });

  // Single frontend refresh
  services.chat.sendRecentThreadsRefresh();

  return { text: summary, skipMessage: true };
}
