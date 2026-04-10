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
import { getClaudeState, persistClaudeState } from './_helpers/thread-context';

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

  // Phase-aware system-prompt nudging (plan/edit/review).
  const phaseHint = phase ? PHASE_HINTS[phase] : undefined;
  const composedSystemPrompt = [phaseHint, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  // ─── Permission handler (control_request → approval block → response) ────
  const onPermissionRequest = askForPermissions
    ? async (req: { tool_name: string; input: Record<string, unknown>; tool_use_id: string }) => {
        // Preserve any streamed text written so far before the approval block.
        writer.flush();

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
          return allow
            ? { behavior: 'allow' as const }
            : { behavior: 'deny' as const, message: response?.reason || 'User denied' };
        } catch (err: any) {
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
        // the text. Only render tool_use blocks here — there's no delta
        // equivalent for them, so this is the sole place they surface.
        const blocks = line.message?.content || [];
        for (const block of blocks) {
          if (block?.type === 'tool_use') {
            const note = `\n\n> 🔧 ${block.name}${block.input ? ` (${shortenInput(block.input)})` : ''}\n\n`;
            writer.pushImmediate(note);
          }
        }
        continue;
      }

      if (line.type === 'tool_progress') {
        // Lightweight heartbeat — we already posted the tool_use note, no more text.
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
