/**
 * Claude Code Chat — the main conversational action.
 *
 * Drives `services.cli.claudeCode.query(...)`, streams Claude's reply into
 * a chat message live, handles tool-permission prompts by rendering an
 * approval block and awaiting the user's decision, and persists the
 * session id on `thread.context.claudeCode` so follow-up turns in the same
 * thread resume the same conversation.
 *
 * Triggered from the "Claude Code" flow when a user.message arrives with
 * `mode === 'work'`.
 */

import type { ActionMeta, Services, Z, EntityId } from '../../types';
import { awaitMessageResponse } from './_helpers/await-message-response';
import { createStreamWriter } from './_helpers/stream-writer';
import { createToolActivityWriter } from './_helpers/tool-activity-writer';
import { ensureSessionArtifact, updateSessionArtifact } from './_helpers/session-artifact';
import { parseUnifiedDiff } from './_helpers/parse-diff';
import { getClaudeState, persistClaudeState } from './_helpers/thread-context';

/** Tools whose execution mutates files and should roll up into a diff artifact. */
const FILE_MUTATION_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

export const meta: ActionMeta = {
  label: 'Claude Code Chat',
  description: 'Drives Claude Code in streaming mode for the current thread, resuming prior sessions and prompting the user for tool permissions.',
  category: 'claude-code',
  input: {
    threadId: { type: 'string', description: 'Target thread', required: true },
    text: { type: 'string', description: 'User message text', required: true },
    mode: { type: 'string', description: 'Agent mode (passed through from user.message)', required: false },
    phase: { type: 'string', description: 'Sub-phase within mode (plan/edit/review)', required: false },
    model: { type: 'string', description: 'Override Claude model (alias or full id)', required: false },
    allowedTools: { type: 'array', description: 'Tools allowed without prompting', required: false },
    disallowedTools: { type: 'array', description: 'Tools always denied', required: false },
    systemPrompt: { type: 'string', description: 'Extra system prompt to append', required: false },
    askForPermissions: { type: 'boolean', description: 'Prompt user on tool use. Default true.', required: false },
  },
};

/** Read-only tools that auto-pass — users shouldn't have to approve a Read. */
const DEFAULT_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep'];

const PHASE_HINTS: Record<string, string> = {
  plan: 'You are in the PLAN phase. Focus on strategy, task breakdown, and clarifying questions. Avoid making file changes unless explicitly asked.',
  edit: 'You are in the EDIT phase. Implement the agreed-upon plan. Prefer small, focused edits.',
  review: 'You are in the REVIEW phase. Critically audit the recent changes. Point out bugs, regressions, and unhandled edge cases.',
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const {
    threadId,
    text,
    phase,
    model,
    allowedTools,
    disallowedTools,
    systemPrompt,
    askForPermissions = true,
  } = params as {
    threadId: EntityId;
    text: string;
    mode?: string;
    phase?: string;
    model?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    systemPrompt?: string;
    askForPermissions?: boolean;
  };

  const log = services.logger;
  log.debug('chat action invoked', { threadId, mode: params.mode, phase, textLen: text?.length });

  if (!threadId || !text?.trim()) {
    return { success: false, error: 'threadId and text are required' };
  }
  // Note: the mode gate lives in the claude-code flow's `branch()` node.
  // This action is only invoked when the flow's switch matches `mode == 'work'`.

  // Resume any prior conversation parked on this thread.
  const prior = getClaudeState(services, threadId);
  const resumeSessionId = prior?.sessionId;
  log.debug('resume state resolved', { resumeSessionId: resumeSessionId ?? null });

  // Create the empty assistant message we'll stream into.
  const { messageId } = services.chat.sendBlockMessage({
    threadId,
    text: '',
    blocks: [],
  });
  log.debug('placeholder message created', { messageId });

  const writer = createStreamWriter(services, messageId, { intervalMs: 80 });
  const toolActivity = createToolActivityWriter(services, messageId, { intervalMs: 250 });

  // Upsert the thread's claude-session artifact so the right-panel card
  // appears immediately and transitions to 'streaming'. sessionId/model/cwd
  // are filled in on the first system/init event inside the stream loop.
  ensureSessionArtifact(services, threadId, {
    status: 'streaming',
    startedAt: Date.now(),
  });
  updateSessionArtifact(services, threadId, { status: 'streaming' });

  // Phase-aware system-prompt nudging (plan/edit/review).
  const phaseHint = phase ? PHASE_HINTS[phase] : undefined;
  const composedSystemPrompt = [phaseHint, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  // ─── Permission handler (control_request → approval block → response) ────
  const onPermissionRequest = askForPermissions
    ? async (req: { tool_name: string; input: Record<string, unknown>; tool_use_id: string }) => {
        // Preserve any streamed text written so far before the approval block.
        writer.flush();
        // Flip the session card into "awaiting-permission" so the status dot
        // turns yellow while we wait for the user. Reset below after the
        // response (allow or deny).
        updateSessionArtifact(services, threadId, { status: 'awaiting-permission' });

        const contextSummary = `Tool: ${req.tool_name}\nInput:\n${JSON.stringify(req.input, null, 2)}`;
        const approval = services.chat.sendApprovalBlock({
          threadId,
          text: `Claude Code wants to run ${req.tool_name}`,
          prompt: `Allow \`${req.tool_name}\`?`,
          context: contextSummary,
          requireReason: false,
          allowReason: true,
          forkable: false,
        });

        try {
          const response = await awaitMessageResponse(services, approval.messageId);
          // Approval block responses look like { value: 'yes' | 'no', reason? }
          const allow = response?.value === 'yes' || response?.value === true || response === 'yes';
          updateSessionArtifact(services, threadId, { status: 'streaming' });
          return allow
            ? { behavior: 'allow' as const }
            : { behavior: 'deny' as const, message: response?.reason || 'User denied' };
        } catch (err: any) {
          updateSessionArtifact(services, threadId, { status: 'streaming' });
          return { behavior: 'deny' as const, message: err?.message || 'Approval failed' };
        }
      }
    : undefined;

  // ─── Fire the query ───────────────────────────────────────────────────────
  try {
    log.debug('invoking claudeCode.query', {
      model,
      resumeSessionId: resumeSessionId ?? null,
      permissionMode: 'default',
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      hasSystemPrompt: !!composedSystemPrompt,
      askForPermissions,
    });
    const handle = await services.cli.claudeCode.query({
      prompt: text,
      resume: resumeSessionId,
      model,
      includePartialMessages: true,
      permissionMode: 'default',
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools,
      systemPrompt: composedSystemPrompt,
      onPermissionRequest,
    });
    log.debug('query handle received, draining events');

    // Drain the event stream. We accumulate assistant text and annotate
    // tool-use lifecycle inline so the user sees the agent thinking.
    let eventCount = 0;
    for await (const ev of handle.events) {
      const line = ev as any;
      eventCount++;
      if (eventCount <= 5 || eventCount % 20 === 0) {
        log.debug('stream event', { n: eventCount, type: line?.type });
      }

      // First `system/init` event carries sessionId/model/cwd — fill them
      // into the session artifact so the right-panel card has live data.
      if (line.type === 'system' && line.subtype === 'init') {
        updateSessionArtifact(services, threadId, {
          sessionId: line.session_id || '',
          model: line.model || '',
          cwd: line.cwd || '',
        });
        continue;
      }

      if (line.type === 'stream_event') {
        // Anthropic text deltas. Shape: { event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }
        const delta = line.event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          writer.push(delta.text);
          continue;
        }
      }

      if (line.type === 'assistant') {
        // With includePartialMessages, stream_event deltas already populated
        // the text. Extract tool_use blocks into the tool-activity writer —
        // they become rows in a collapsible group rather than inline
        // `> 🔧 name` blockquotes flooding the prose.
        const blocks = line.message?.content || [];
        for (const block of blocks) {
          if (block?.type === 'tool_use') {
            // Flush any pending prose text first so the activity block
            // visually lands after the prose that prompted it — we can't
            // truly interleave blocks into text (see tool-activity-writer
            // docstring), but at least the prose-up-to-now commits first.
            writer.flush();
            const summary = block.input ? shortenInput(block.input) : '';
            toolActivity.append({
              id: block.id || `tu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              tool: block.name,
              summary,
              status: 'running',
              details: { input: block.input },
            });
            // Live-update the session artifact's tool counter and lastTool
            // hint. The read-modify-write inside updateSessionArtifact
            // handles the counter increment correctly.
            updateSessionArtifact(services, threadId, (prev) => ({
              toolCallCount: (prev.toolCallCount ?? 0) + 1,
              lastTool: { name: block.name, summary, at: Date.now() },
            }));
          }
        }
        continue;
      }

      if (line.type === 'tool_progress') {
        // Heartbeat with elapsed time. Update the matching row's duration
        // (if the CLI reports one) so the group label stays fresh.
        if (line.tool_use_id && typeof line.elapsed_time_seconds === 'number') {
          toolActivity.update(line.tool_use_id, {
            durationMs: Math.round(line.elapsed_time_seconds * 1000),
          });
        }
        continue;
      }

      if (line.type === 'tool_use_summary') {
        // CLI reports a summary string covering one or more prior tool_uses.
        // Apply the summary to every referenced tool and flip the status to
        // 'ok' so the row renders with a green check.
        const ids: string[] = Array.isArray(line.preceding_tool_use_ids)
          ? line.preceding_tool_use_ids
          : [];
        const summaryText: string = typeof line.summary === 'string' ? line.summary : '';
        for (const id of ids) {
          toolActivity.update(id, {
            status: 'ok',
            outputSummary: summaryText || undefined,
          });
        }
        continue;
      }
    }

    log.debug('stream drained, awaiting final result', { eventCount });

    // Final result: grab sessionId + costing and persist back to the thread.
    const result = await handle.result;
    log.debug('final result received', {
      sessionId: result.sessionId,
      textLen: result.text?.length ?? 0,
      costUsd: result.totalCostUsd,
      durationMs: result.durationMs,
    });

    persistClaudeState(services, threadId, {
      sessionId: result.sessionId,
      lastTurnAt: Date.now(),
    });

    toolActivity.finalise('done');
    // Close out the session card: bump turn + cost counters and flip to idle.
    updateSessionArtifact(services, threadId, (prev) => ({
      status: 'idle',
      turns: (prev.turns ?? 0) + 1,
      totalCostUsd: (prev.totalCostUsd ?? 0) + (result.totalCostUsd ?? 0),
      lastTurnAt: Date.now(),
    }));

    // ─── Phase C: promote file mutations to a diff artifact ────────────
    // If any Write/Edit/NotebookEdit tools ran during the turn, assemble a
    // diff artifact showing the working-copy changes and attach a pointer
    // from the tool-activity block. Failures are non-fatal — the turn
    // already succeeded.
    try {
      const mutatedPaths = extractMutatedPaths(toolActivity.entries);
      if (mutatedPaths.length > 0) {
        log.debug('collecting diff for mutated files', { paths: mutatedPaths });
        const unified = await services.cli.git.getDiff(mutatedPaths);
        const parsed = parseUnifiedDiff(unified);
        if (parsed.files.length > 0) {
          const diffTitle = deriveDiffTitle(text);
          const { artifactId } = services.artifact.createAndNotify({
            artifactType: 'diff',
            title: diffTitle,
            content: parsed,
            threadId,
          });
          toolActivity.setArtifactRef({ artifactId, label: diffTitle });
          log.debug('diff artifact created', { artifactId, fileCount: parsed.files.length });
        }
      }
    } catch (diffErr: any) {
      // Non-fatal — log and carry on. The user still has the activity block
      // with per-file Write/Edit rows; they just don't get the rollup view.
      log.warn('diff artifact assembly failed', { message: diffErr?.message });
    }

    // ─── Phase D-min: create a plan artifact stub in plan mode ─────────
    // Only fires if the caller explicitly requested plan mode (no user-
    // facing toggle yet — needs a separate follow-up task).
    if ((params as any).permissionMode === 'plan' && result.text) {
      try {
        services.artifact.createAndNotify({
          artifactType: 'plan',
          title: 'Plan',
          content: { notes: result.text, status: 'draft', steps: [] },
          threadId,
        });
        log.debug('plan artifact created');
      } catch (planErr: any) {
        log.warn('plan artifact creation failed', { message: planErr?.message });
      }
    }

    writer.finalize(writer.text || result.text);
    log.debug('chat action completed');

    return {
      success: true,
      sessionId: result.sessionId,
      messageId,
      text: writer.text,
      costUsd: result.totalCostUsd,
      durationMs: result.durationMs,
    };
  } catch (err: any) {
    const message = err?.message || 'Claude Code request failed';
    log.error('chat action failed', { message, stack: err?.stack });
    toolActivity.finalise('error');
    updateSessionArtifact(services, threadId, { status: 'idle' });
    writer.finalize(`${writer.text}\n\n⚠️ ${message}`.trim());
    // Intentionally NOT clearing thread.context on error — the session may
    // still be valid on disk; let the user retry or call the reset action
    // explicitly.
    return { success: false, error: message, messageId };
  }
}

/** Shorten tool inputs for the inline tool-use note. */
function shortenInput(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 0) return '';
  const primary = (input as any).path || (input as any).file_path || (input as any).command || (input as any).pattern;
  if (typeof primary === 'string') return primary.length > 60 ? primary.slice(0, 57) + '…' : primary;
  return keys.slice(0, 3).join(', ');
}

/**
 * Collect the file paths that a turn's file-mutation tool entries touched,
 * so we can feed them to `git diff` for the diff artifact. Deduped; preserves
 * first-seen order.
 */
function extractMutatedPaths(entries: ReadonlyArray<{ tool: string; details?: { input?: unknown } }>): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const entry of entries) {
    if (!FILE_MUTATION_TOOLS.has(entry.tool)) continue;
    const input = entry.details?.input as Record<string, unknown> | undefined;
    if (!input) continue;
    const path = (input.file_path || input.path) as string | undefined;
    if (typeof path !== 'string') continue;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/**
 * Derive a short human title for the diff artifact from the user's turn
 * message. First line, trimmed, truncated to ~60 chars.
 */
function deriveDiffTitle(userText: string): string {
  const firstLine = userText.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Claude Code changes';
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + '…';
}
