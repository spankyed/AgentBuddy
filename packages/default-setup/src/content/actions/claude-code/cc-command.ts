/**
 * CC: Run Command — dispatcher for lightweight cc- commands (info, config, passthrough).
 *
 * Heavy operations are routed by the flow to separate actions:
 * - CC: Session Ops (cc-session-ops.ts) — resume, import
 * - CC: Thread Ops (cc-thread-ops.ts) — compact, fork, add-dir, set-dir
 */

import type { ActionMeta } from '@apackdev/sdk/build';
import type { Services, Z, EntityId } from '#generated/services.ts';
import { getClaudeState, persistClaudeState, updateChatState, dequeueMessage } from './_helpers/thread-context.ts';
import { replayQueuedMessage } from './_helpers/stream-consumer.ts';
import { DONT_BYPASS } from './_helpers/auto-approve.ts';
import { parseCommandArguments } from './_helpers/command-arguments.ts';

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
  rawText?: string,
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
  return async (args, services, threadId, rawText) => {
    const prior = threadId ? getClaudeState(services, threadId) : undefined;
    const cwd = prior?.cwdOverride || prior?.cwd;
    const argv = rawText === undefined ? args : parseCommandArguments(rawText);
    const fullArgs = [spec.cmd, ...(argv.length > 0 ? argv : spec.defaultArgs ?? [])];
    const result = await services.cli.claudeCode.exec(fullArgs, cwd ? { cwd } : undefined);
    const output = (result.stdout + result.stderr).trim();
    return { text: output || `(no output from cc-${spec.cmd})` };
  };
}

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, Handler> = {
  sessions: handleSessions,
  config: handleConfig,
  status: handleStats,
  model: handleModel,
  workflows: handleWorkflows,
  memory: handleMemory,
  hooks: handleHooks,
  permissions: handlePermissions,
  skills: handleSkills,
  stats: handleStats,
  rename: handleRename,
  bypass: handleBypass,
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
      result = await handler(args, services, threadId, text);
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
  threadId?: string,
): Promise<{ text: string; data?: any; blocks?: any[] }> {
  // Resolve effective cwd from thread context so sessions are scoped to the
  // correct project directory (e.g. thread created via "+ new thread" menu).
  const prior = threadId ? getClaudeState(services, threadId) : undefined;
  const codeSettings = services.settings.get({ kind: 'feature', featureRef: 'default-setup/code' }) as any;
  const effectiveCwd = prior?.cwdOverride
    || prior?.cwd
    || codeSettings?.defaultBaseDirectory
    || codeSettings?.baseDirectory
    || undefined;
  const cwdOpts = effectiveCwd ? { cwd: effectiveCwd } : undefined;

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

  const sessions = await services.cli.claudeCode.listSessions(cwdOpts);
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

async function handleWorkflows(args: string[], services: Services, threadId?: string): Promise<{ text: string; data?: any }> {
  if (args.length && (args.length !== 2 || args[0] !== 'stop')) return { text: 'Usage: cc-workflows [stop <task id>]' };
  if (!threadId) return { text: 'Select a thread to view its native workflows.' };
  const conversation = services.cli.claudeCode.getConversation(threadId);
  if (!conversation) return { text: 'No native conversation is running. Workflow status is unavailable.' };
  const owner = conversation.owner;
  const tasks = owner.listWorkflows();
  if (!args.length) return { text: tasks.length
    ? [`Native workflows${owner.sessionCwd ? ` in ${owner.sessionCwd}` : ''}:`, ...tasks.map(task => `${task.taskId}: ${task.name} — ${task.status}${task.phase ? ` (${task.phase})` : ''}`)].join('\n')
    : 'No local workflows have been observed in this conversation.', data: tasks };
  const task = tasks.find(task => task.taskId === args[1]);
  if (!task) return { text: `No tracked Workflow with task ID: ${args[1]}` };
  if (task.status !== 'running') return { text: `${task.name} is already ${task.status}.` };
  await owner.handle.stopTask(task.taskId);
  if (services.cli.claudeCode.getConversation(threadId)?.owner !== owner || owner.closing) return { text: 'The conversation changed while requesting the stop; Workflow status is unverified.' };
  const current = owner.listWorkflows().find(value => value.taskId === task.taskId);
  return { text: current && current.status !== 'running'
    ? `${task.name}: ${current.status}.`
    : `Stop request acknowledged for ${task.name} (${task.taskId}). Waiting for native task status.` };
}

async function handleModel(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!threadId) return { text: 'Select a thread before choosing its Claude model.' };
  const prior = getClaudeState(services, threadId);
  if (args.length === 0) return { text: `Selected: ${prior?.modelOverride || 'default'}\nLast reported: ${prior?.model || '(not yet reported)'}` };
  if (args.length !== 1) return { text: 'Usage: cc-model <alias or model id>' };
  const selection = args[0]!;
  const conversation = services.cli.claudeCode.getConversation(threadId);
  if (conversation) {
    if (conversation.owner.busy) return { text: 'Wait for the Claude conversation to become idle before changing model.' };
    const cwd = prior?.cwdOverride || prior?.cwd || services.cli.claudeCode.getWorkingDir();
    if (conversation.owner.sessionCwd !== cwd) return { text: 'The native conversation directory does not match this project. Start a conversation in this project before changing its model.' };
    try {
      await conversation.owner.handle.setModel(selection);
      persistClaudeState(services, threadId, { modelOverride: selection });
      return { text: `Model selection accepted: ${selection}. The next turn will report the effective model.` };
    } finally {
      if (!conversation.owner.busy && !conversation.owner.closing) {
        const queued = dequeueMessage(services, threadId);
        if (queued) await replayQueuedMessage(services, threadId as EntityId, queued, services.logger);
      }
    }
  }
  persistClaudeState(services, threadId, { modelOverride: selection });
  return { text: `Model selected for the next launch: ${selection}. Claude will validate it when starting.` };
}

async function handlePermissions(args: string[], services: Services, threadId?: string, rawText?: string): Promise<{ text: string; data?: any }> {
  const explicitStart = args[0] === 'start';
  if (explicitStart) args = args.slice(1);
  if (explicitStart) rawText = rawText?.trim().replace(/^start(?:\s+|$)/, '');
  const editing = args.length > 0;
  const edit = rawText?.trim().match(/^(add|remove)\s+(allow|deny|ask)\s+(userSettings|projectSettings|localSettings)\s+([\s\S]+)$/);
  if (editing && !edit) return { text: 'Usage: cc-permissions [start] [add|remove <allow|deny|ask> <userSettings|projectSettings|localSettings> <exact rule>]' };
  if (editing && threadId && services.cli.claudeCode.isConversationBusy(threadId)) {
    return { text: 'Wait for the Claude conversation to become idle before editing permission rules.' };
  }
  const prior = threadId ? getClaudeState(services, threadId) : undefined;
  const cwd = prior?.cwdOverride || prior?.cwd;
  let handle = threadId ? services.cli.claudeCode.getHandle(threadId) : undefined;
  if (handle && threadId) {
    const nativeCwd = services.cli.claudeCode.getConversation(threadId)?.owner.sessionCwd;
    if (nativeCwd !== (cwd || services.cli.claudeCode.getWorkingDir())) {
      if (editing) return { text: 'The native conversation directory does not match this project. Start a conversation in this project before editing its permission rules.' };
      handle = undefined;
    }
  }
  const options = cwd ? { cwd } : undefined;
  if (!handle && !explicitStart) return { text: 'No matching native conversation is running. Use cc-permissions start [add|remove ...] to read or edit with a temporary native process. Starting and closing it can run configured session hooks.' };
  let notice = '';
  let data;
  if (edit) {
    const behavior = edit[2] as 'allow' | 'deny' | 'ask';
    const source = edit[3] as 'userSettings' | 'projectSettings' | 'localSettings';
    const rule = edit[4]!;
    const saved = await services.cli.claudeCode.editPermissionRules(edit[1] === 'add'
      ? { op: 'add', rules: [rule], behavior, destination: source }
      : { op: 'remove', rule, behavior, source }, options);
    notice = `Saved ${source} permission change.\n`;
    for (const warning of saved.warnings) notice += `Native warning: ${warning}\n`;
    if (saved.stored.length) notice += `Native stored rules: ${saved.stored.join(', ')}\n`;
    try { data = handle ? await handle.refreshPermissionRules() : await services.cli.claudeCode.getPermissionRules(options); }
    catch (error: any) { return { text: `${notice}The change was saved, but native permission refresh failed: ${error?.message || 'Unknown error'}. Running permission state is unverified.` }; }
  } else {
    data = handle ? await handle.getPermissionRules() : await services.cli.claudeCode.getPermissionRules(options);
  }
  const state = data.state;
  const lines = [handle ? 'Running conversation permissions' : 'Project configuration permissions', `Workspace: ${state.originalCwd}`, `Managed-only rules: ${state.managedOnly ? 'yes' : 'no'}`];
  for (const rule of state.rules) lines.push(`${rule.behavior} [${rule.source}; ${rule.editability}${rule.notInEffect ? '; not in effect' : ''}] ${rule.rule}`);
  if (!state.rules.length) lines.push('No permission rules listed.');
  for (const directory of state.workspaceDirectories) lines.push(`Directory${directory.source ? ` [${directory.source}]` : ''}: ${directory.path}`);
  for (const error of state.errors ?? []) lines.push(`Settings error: ${error.file}: ${error.message}`);
  return { text: notice + lines.join('\n'), data };
}

async function handleHooks(args: string[], services: Services, threadId?: string, rawText?: string): Promise<{ text: string; data?: any }> {
  const explicitStart = args.length === 1 && args[0] === 'start';
  const editing = args[0] === 'apply';
  if ((args.length && !editing && !explicitStart) || (editing && !rawText?.trim().startsWith('apply '))) return { text: 'Usage: cc-hooks [start | apply <native JSON edit>]' };
  if (editing && threadId && services.cli.claudeCode.isConversationBusy(threadId)) return { text: 'Wait for the Claude conversation to become idle before editing hooks.' };

  const prior = threadId ? getClaudeState(services, threadId) : undefined;
  const cwd = prior?.cwdOverride || prior?.cwd;
  let handle = threadId ? services.cli.claudeCode.getHandle(threadId) : undefined;
  if (handle && threadId && services.cli.claudeCode.getConversation(threadId)?.owner.sessionCwd !== (cwd || services.cli.claudeCode.getWorkingDir())) {
    if (editing) return { text: 'The native conversation directory does not match this project. Start a conversation in this project before editing hooks.' };
    handle = undefined;
  }
  let notice = '';
  if (editing) {
    const edit = JSON.parse(rawText!.trim().slice('apply '.length));
    const result = await services.cli.claudeCode.editHook(edit, cwd ? { cwd } : undefined);
    if (!result.ok) return { text: `Native hook edit refused [${result.code}]: ${result.error}`, data: result };
    notice = 'Saved the hook edit.\n';
    if (handle && threadId) {
      try {
        if (!await services.cli.claudeCode.closeIdleConversation(threadId)) return { text: `${notice}The native conversation could not be closed for reload. Restart it before relying on the new hook configuration.` };
      } catch (error: any) { return { text: `${notice}Closing the native conversation for reload failed: ${error?.message || 'Unknown error'}` }; }
      notice += 'Closed the idle native process; the next conversation launch will load its hook configuration.\n';
      handle = undefined;
    }
    return { text: `${notice}Use cc-hooks start to read a fresh catalog; starting it can run configured session hooks.`, data: result };
  }
  if (!handle && !explicitStart) return { text: 'No matching native conversation is running. Use cc-hooks start to open a temporary native process and read its catalog. Starting and closing it can run configured session hooks.' };
  const data = handle ? await handle.getHooksListing() : await services.cli.claudeCode.getHooksListing(cwd ? { cwd } : undefined);
  const lines = [`Native hooks (${handle ? 'current conversation' : 'new process for selected project'}).`, `${data.eventCatalog.length} available events; ${data.hooks.length} configured hooks.`];
  if (data.policy.allDisabled) lines.push('Hook execution is disabled in this native configuration.');
  if (data.policy.disabledByPolicy) lines.push('Managed policy disables hooks.');
  if (data.policy.managedOnly) lines.push('Managed policy permits managed hooks only.');
  if (data.policy.pluginOnly) lines.push('Managed policy restricts hooks to plugin sources.');
  if (data.policy.policyUnreadable) lines.push('Managed policy could not be read.');
  if (data.bareMode) lines.push(`Bare mode: ${data.bareMode.exitHint}`);
  if (data.safeMode) lines.push(`Safe mode: ${data.safeMode.exitHint}${data.safeMode.managedHooksStillApply ? '; managed hooks still apply' : ''}`);
  for (const hook of data.hooks) lines.push(`${hook.event}${hook.matcher ? ` (${hook.matcher})` : ''} [${hook.source}; ${hook.disabled ? 'disabled' : 'enabled'}; ${hook.editable ? 'file-editable' : 'read-only'}] ${hook.displayText}${hook.editable?.headersRedacted ? ' (HTTP header values hidden)' : ''}`);
  if (!data.hooks.length) lines.push('No configured hooks in this native scope.');
  lines.push(`Events: ${data.eventCatalog.map(event => `${event.name}${event.supportsMatcher ? ' (matcher)' : ''}`).join(', ')}`);
  for (const error of data.errors ?? []) lines.push(`Settings error: ${error.file} ${error.path}: ${error.message}`);
  return { text: notice + lines.join('\n'), data };
}

async function handleMemory(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  const explicitStart = args[0] === 'start';
  if (explicitStart) args = args.slice(1);
  if (args[0] === 'add' || args[0] === 'remove') {
    return { text: `Memory add/remove is only available in the Claude Code terminal. Use /memory ${args[0]} there.` };
  }
  const editing = args.length > 0;
  if (editing && (args.length !== 2 || args[0] !== 'auto' || !['on', 'off'].includes(args[1]!))) {
    return { text: 'Usage: cc-memory [start] auto <on|off> (user setting)' };
  }
  if (editing && threadId && services.cli.claudeCode.isConversationBusy(threadId)) {
    return { text: 'Wait for the Claude conversation to become idle before changing auto-memory.' };
  }
  const prior = threadId ? getClaudeState(services, threadId) : undefined;
  const cwd = prior?.cwdOverride || prior?.cwd;
  let handle = threadId ? services.cli.claudeCode.getHandle(threadId) : undefined;
  if (handle && threadId) {
    const nativeCwd = services.cli.claudeCode.getConversation(threadId)?.owner.sessionCwd;
    if (nativeCwd !== (cwd || services.cli.claudeCode.getWorkingDir())) {
      if (editing) return { text: 'The native conversation directory does not match this project. Start a conversation in this project before changing auto-memory.' };
      handle = undefined;
    }
  }
  const options = cwd ? { cwd } : undefined;
  if (!handle && !explicitStart) return { text: 'No matching native conversation is running. Use cc-memory start [auto on|off] to read or edit with temporary native processes. Starting and closing them can run configured session hooks.' };
  const read = () => handle ? handle.getMemoryDialog() : services.cli.claudeCode.getMemoryDialog(options);
  let data = await read();
  let notice = '';
  if (editing) {
    if (!data.auto_memory.toggleable) return { text: `Auto-memory cannot be changed in this native session: ${data.auto_memory.status}` };
    const enabled = args[1] === 'on';
    await services.cli.claudeCode.setAutoMemory(enabled, options);
    notice = `Saved user auto-memory setting: ${enabled ? 'on' : 'off'}.\n`;
    try { data = await read(); } catch (error: any) {
      return { text: `${notice}Saved the setting, but reading native status failed: ${error?.message || 'Unknown error'}` };
    }
    if (data.auto_memory.enabled !== enabled) notice += `Native session status remains ${data.auto_memory.status}.\n`;
  }
  const lines = data.files.map(file => `${file.label} [${file.kind}]${file.exists ? '' : ' (missing)'}  ${file.path}`);
  for (const folder of data.folders) lines.push(`${folder.label}  ${folder.path}`);
  for (const memory of data.memories ?? []) lines.push(`${memory.name}${memory.type ? ` [${memory.type}]` : ''}  ${memory.path}`);
  lines.push(`Auto-memory: ${data.auto_memory.status}${data.auto_memory.toggleable ? '' : ' (unavailable)'}`);
  if (data.auto_dream.shown) lines.push(`Auto-dream: ${data.auto_dream.status}${data.auto_dream.detail ? ` — ${data.auto_dream.detail}` : ''}${data.auto_dream.toggleable ? '' : ' (unavailable)'}`);
  return { text: notice + lines.join('\n'), data };
}

async function handleSkills(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  const explicitStart = args[0] === 'start';
  if (explicitStart) args = args.slice(1);
  const prior = threadId ? getClaudeState(services, threadId) : undefined;
  const cwd = prior?.cwdOverride || prior?.cwd;
  const options = cwd ? { cwd } : undefined;
  const editing = args.length > 0;
  if (editing && (args.length !== 3 || args[0] !== 'set')) {
    return { text: 'Usage: cc-skills [start] set <name> <on|name-only|user-invocable-only|off>' };
  }
  if (editing && threadId && services.cli.claudeCode.isConversationBusy(threadId)) {
    return { text: 'Wait for the Claude conversation to become idle before changing Skill state.' };
  }
  let handle = threadId ? services.cli.claudeCode.getHandle(threadId) : undefined;
  if (handle && threadId) {
    const processCwd = services.cli.claudeCode.getConversation(threadId)?.owner.sessionCwd;
    const selectedCwd = cwd || services.cli.claudeCode.getWorkingDir();
    if (processCwd !== selectedCwd) {
      if (editing) return { text: 'The native conversation directory does not match this project. Start a conversation in this project before editing its Skills.' };
      handle = undefined;
    }
  }
  if (!handle && !explicitStart) return { text: 'No matching native conversation is running. Use cc-skills start [set <name> <state>] to read or edit with temporary native processes. Starting and closing them can run configured session hooks.' };
  let skills = handle ? (await handle.getSkillsDialog()).skills : await services.cli.claudeCode.listSkills(options);
  let notice = '';
  if (editing) {
    const name = args[1]!;
    const matches = skills.filter(skill => skill.name === name);
    if (matches.length !== 1) return { text: `Skill name must identify exactly one native entry: ${name}` };
    const skill = matches[0]!;
    const result = await services.cli.claudeCode.editSkill({ name, state: args[2]!, handles: skill.handles }, options);
    notice = result.changed ? `Updated ${name}.\n` : `No change to ${name}.\n`;
    try {
      if (handle) await handle.reloadSkills();
      skills = handle ? (await handle.getSkillsDialog()).skills : await services.cli.claudeCode.listSkills(options);
    } catch (error: any) {
      return { text: `${notice}Saved Skill state, but native refresh failed: ${error?.message || 'Unknown error'}` };
    }
  }
  if (!skills.length) return { text: 'No skills installed.' };
  const lines = skills.map(s => {
    const lock = s.locked_by ? `; locked by ${s.locked_by}` : '';
    const invocation = s.advertised ? '' : '; hidden from command suggestions';
    return `${s.display_name} [${s.source}] — ${s.state}${lock}${invocation}`;
  });
  return { text: notice + lines.join('\n'), data: skills };
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

async function handleRename(
  args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const ccState = getClaudeState(services, threadId);
  const sessionId = ccState?.sessionId;
  if (!sessionId) return { text: 'No active session — run a Claude Code turn first.' };

  let newTitle: string;

  if (args.length > 0) {
    newTitle = args.join(' ');
  } else {
    newTitle = await generateTitle(services, threadId);
  }

  // /rename is REPL-only — doesn't work via `claude -p`. Use direct JSONL rename.
  await services.cli.claudeCode.renameSession(sessionId, newTitle, {
    ...(ccState.cwd && { cwd: ccState.cwd }),
  });

  services.repository.threadCommands.update(threadId as any, { topic: newTitle });
  services.emitter.broadcastToPlugin('default-setup/threads', {
    type: 'THREAD_UPDATED',
    threadId,
    updates: { topic: newTitle },
  });

  return { text: `Renamed to: ${newTitle}` };
}

async function generateTitle(services: Services, threadId: string): Promise<string> {
  const threadData = services.repository.chatQueries.threadData(threadId as any);
  const messages = threadData?.messages ?? [];

  if (messages.length === 0) return 'Untitled';

  const serialized = messages
    .filter((m: any) => !m.compacted && m.status !== 'cancelled' && !m.deleted && m.text
      && !(m.sender === 'user' && /^\/\S+/.test(m.text)))
    .slice(-10)
    .map((m: any) => {
      const role = m.sender === 'user' ? 'User' : 'Assistant';
      return `[${role}] ${m.text}`;
    })
    .join('\n');

  if (!serialized) return 'Untitled';

  const handle = await services.cli.claudeCode.query({
    prompt: `Generate a short, descriptive title (3-6 words, no quotes) for this conversation. Respond with ONLY the title text, nothing else.\n\n${serialized}`,
    permissionMode: 'plan',
    allowedTools: [],
    noSessionPersistence: true,
    maxTurns: 1,
  });

  for await (const _ev of handle.events) { /* drain */ }
  const result = await handle.result;
  const title = result.text?.trim().replace(/^["']|["']$/g, '') || '';

  // Reject obviously bad titles (too long or LLM went off-script)
  if (!title || title.length > 60 || title.includes('\n')) return 'Untitled';
  return title;
}

async function handleBypass(
  _args: string[],
  services: Services,
  threadId?: string,
): Promise<{ text: string; data?: any }> {
  if (!threadId) return { text: 'No active thread — run a Claude Code turn first.' };

  const prior = getClaudeState(services, threadId);
  if (!prior) return { text: 'No Claude Code state on this thread.' };

  const current = prior.permissionMode ?? 'default';
  const enabling = current !== 'bypassPermissions';
  const mode = enabling ? 'bypassPermissions' : 'default';
  const updates: Record<string, unknown> = { permissionMode: mode };

  // Auto-approve pending control request when enabling bypass
  if (enabling) {
    const pending = prior.pendingControlRequest;
    if (pending?.requestId && !DONT_BYPASS.has(pending.toolName)) {
      const handle = (services.cli as any).claudeCode.getHandle(threadId);
      if (handle) {
        handle.respond(pending.requestId, {
          behavior: 'allow',
          updatedInput: pending.originalInput ?? {},
        });
        services.chat.updateMessageState(pending.approvalMessageId as any, {
          responseTimestamp: Date.now(),
          blockResponse: { approved: true },
        } as any);
        updates.pendingControlRequest = undefined;
        updates.isRunning = true;
      }
    }
  }

  persistClaudeState(services, threadId, updates as any);

  if (updates.isRunning) {
    updateChatState(services, threadId as any, 'working');
  }

  return { text: enabling ? 'Bypass enabled' : 'Bypass disabled' };
}
