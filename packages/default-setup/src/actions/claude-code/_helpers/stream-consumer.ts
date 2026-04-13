/**
 * Stream consumer — fire-and-forget async function that owns the `for await`
 * loop over a Claude Code CLI handle's event stream.
 *
 * Extracted from `chat.ts` so the chat action can return immediately after
 * starting the query. This function runs detached from the action lifecycle:
 * it processes all stream events, handles control_requests, finalises writers,
 * creates diff artifacts, and drains queued messages.
 *
 * Error boundary: the entire body is wrapped in try/catch. Errors never
 * escape — the catch block logs, finalises writers, updates the session
 * artifact to idle, clears the handle, and drains queued messages.
 */

import type { Services, EntityId } from '../../../types';
import { isPlanFileWrite } from './auto-approve';
import { createStreamWriter } from './stream-writer';
import { createToolActivityWriter } from './tool-activity-writer';
import { updateSessionArtifact } from './session-artifact';
import { createPlanDraft } from './plan-artifact';
import { parseExitPlanModeInput, buildPlanApprovalContext } from './plan-approval';
import { parseAskUserQuestionInput } from './ask-user-question';
import { parseUnifiedDiff } from './parse-diff';
import { persistClaudeState, setRunning, dequeueMessage } from './thread-context';

/** Tools whose execution mutates files and should roll up into a diff artifact. */
const FILE_MUTATION_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

export interface ConsumerContext {
  services: Services;
  threadId: EntityId;
  /** Original user message text — used for diff artifact title. */
  text: string;
  phase?: string;
}

export interface ConsumerWriters {
  writer: ReturnType<typeof createStreamWriter>;
  toolActivity: ReturnType<typeof createToolActivityWriter>;
  messageId: EntityId;
}

/**
 * Consume the CLI event stream in the background. The chat action calls this
 * without awaiting it, so the action returns immediately while this function
 * continues processing events.
 */
export async function consumeStream(
  handle: any,
  ctx: ConsumerContext,
  initialWriters: ConsumerWriters,
): Promise<void> {
  const { services, threadId, text, phase } = ctx;
  const log = services.logger;

  let currentMessageId: EntityId = initialWriters.messageId;
  let writer = initialWriters.writer;
  let toolActivity = initialWriters.toolActivity;

  // Set by the control_request handler after a user-interactive flow.
  // The next `message_start` will split into a new message.
  let splitOnNextMessageStart = false;

  // Track file-mutation paths across all messages for the diff artifact.
  const mutatedPathsSet = new Set<string>();
  const mutatedPaths: string[] = [];

  try {
    // ─── Drain the event stream ──────────────────────────────────────────
    let eventCount = 0;
    for await (const ev of handle.events) {
      const line = ev as any;
      eventCount++;
      if (eventCount <= 5 || eventCount % 20 === 0) {
        log.debug('stream event', { n: eventCount, type: line?.type });
      }

      // First `system/init` event carries sessionId/model/cwd.
      if (line.type === 'system' && line.subtype === 'init') {
        updateSessionArtifact(services, threadId, {
          sessionId: line.session_id || '',
          model: line.model || '',
          cwd: line.cwd || '',
        });
        if (line.session_id) {
          persistClaudeState(services, threadId, {
            sessionId: line.session_id,
            lastTurnAt: Date.now(),
          });
        }
        continue;
      }

      if (line.type === 'stream_event') {
        // ─── Message boundary: split after user interactions ──────
        if (
          line.event?.type === 'message_start' &&
          !line.parent_tool_use_id &&
          splitOnNextMessageStart &&
          (writer.text.length > 0 || toolActivity.hasEntries)
        ) {
          splitOnNextMessageStart = false;
          writer.finalize(writer.text);
          const segmentHadErrors = toolActivity.entries.some(e => e.status === 'error');
          toolActivity.finalise(segmentHadErrors ? 'error' : 'done');

          const splitMsg = services.chat.sendBlockMessage({
            threadId,
            text: '',
            blocks: [],
          });
          log.debug('message split after user interaction', { previousId: currentMessageId, nextId: splitMsg.messageId });
          currentMessageId = splitMsg.messageId as EntityId;
          writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
          toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250 });
        }

        // Anthropic text deltas.
        const delta = line.event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          writer.push(delta.text);
          continue;
        }
      }

      if (line.type === 'assistant') {
        const blocks = line.message?.content || [];
        for (const block of blocks) {
          if (block?.type === 'tool_use') {
            if (block.name === 'ExitPlanMode') continue;

            writer.flush();
            const summary = block.input ? shortenInput(block.input) : '';
            toolActivity.append({
              id: block.id || `tu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              tool: block.name,
              summary,
              status: 'running',
              details: { input: block.input },
            });
            if (FILE_MUTATION_TOOLS.has(block.name) && block.input) {
              const p = (block.input as any).file_path || (block.input as any).path;
              if (typeof p === 'string' && !mutatedPathsSet.has(p)) {
                mutatedPathsSet.add(p);
                mutatedPaths.push(p);
              }
            }
            updateSessionArtifact(services, threadId, (prev) => ({
              toolCallCount: (prev.toolCallCount ?? 0) + 1,
              lastTool: { name: block.name, summary, at: Date.now() },
            }));
          }
        }
        continue;
      }

      if (line.type === 'tool_progress') {
        if (line.tool_use_id && typeof line.elapsed_time_seconds === 'number') {
          toolActivity.update(line.tool_use_id, {
            durationMs: Math.round(line.elapsed_time_seconds * 1000),
          });
        }
        continue;
      }

      if (line.type === 'user') {
        const content = (line.message as { content?: unknown })?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          const b = block as { type?: string; tool_use_id?: unknown; content?: unknown; is_error?: unknown };
          if (b?.type !== 'tool_result') continue;
          const toolUseId = b.tool_use_id;
          if (typeof toolUseId !== 'string') continue;

          const resultText = extractToolResultText(b.content);
          const isError = b.is_error === true;
          const displayText = isError ? stripToolUseErrorEnvelope(resultText) : resultText;
          const outputSummary = displayText.length > 120
            ? displayText.slice(0, 117) + '…'
            : displayText;

          toolActivity.update(toolUseId, {
            status: isError ? 'error' : 'ok',
            outputSummary: outputSummary || undefined,
            ...(isError ? { details: { error: displayText } } : {}),
          });

          if (isError) {
            log.warn('tool execution failed', {
              tool_use_id: toolUseId,
              preview: displayText.slice(0, 200),
            });
          }
        }
        continue;
      }

      // ─── Control requests (surfaced by pump) ────────────────────────
      if (line.type === 'control_request') {
        const req = (line as any).request ?? {};
        const requestId = (line as any).request_id ?? '';

        // Auto-approve plan-file writes during plan phase.
        if (phase === 'plan' && req.subtype === 'can_use_tool' && isPlanFileWrite(req.tool_name, req.input)) {
          log.debug('auto-approved plan-file write', { tool: req.tool_name });
          handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
          continue;
        }

        // Freeze the tool-activity block so it stops showing "Working…".
        writer.flush();
        toolActivity.finalise('done');

        // Send the appropriate interactive block.
        let approvalMessageId: string;

        if (req.tool_name === 'ExitPlanMode') {
          const parsed = parseExitPlanModeInput(req.input ?? {});
          createPlanDraft(services, threadId, parsed.plan);
          const approval = services.chat.sendApprovalBlock({
            threadId,
            text: 'Claude Code is ready to implement — review the plan and approve.',
            prompt: 'Approve this plan and start implementing?',
            context: buildPlanApprovalContext(parsed),
            requireReason: false,
            allowReason: true,
            forkable: false,
          });
          approvalMessageId = approval.messageId;
        } else if (req.tool_name === 'AskUserQuestion') {
          const { questions } = parseAskUserQuestionInput(req.input ?? {});
          const q = questions[0];
          if (q) {
            const choices = q.options.map((opt: any) => ({
              id: opt.label,
              label: opt.label,
              description: opt.description || undefined,
            }));
            const choiceMsg = services.chat.sendChoiceBlock({
              threadId,
              text: q.question,
              prompt: q.header || 'Select an option',
              choices,
              multiSelect: q.multiSelect,
              allowCustom: true,
              displayText: q.header || 'Answer',
              forkable: false,
            });
            approvalMessageId = choiceMsg.messageId;
          } else {
            handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
            continue;
          }
        } else {
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
          approvalMessageId = approval.messageId;
        }

        log.debug('interactive block sent for control_request', {
          requestId,
          toolName: req.tool_name,
          approvalMessageId,
        });

        persistClaudeState(services, threadId, {
          pendingControlRequest: {
            requestId,
            approvalMessageId,
            toolName: req.tool_name ?? 'unknown',
            originalInput: req.input ?? {},
          },
        });

        setRunning(services, threadId, false);
        updateSessionArtifact(services, threadId, { status: 'awaiting-permission' });
        splitOnNextMessageStart = true;
        continue;
      }

      // ─── Control cancellation (surfaced by pump) ───────────────────
      if (line.type === 'control_cancel_request') {
        log.debug('control_cancel_request received, clearing pending state');
        persistClaudeState(services, threadId, { pendingControlRequest: undefined });
        continue;
      }

      if (line.type === 'tool_use_summary') {
        const ids: string[] = Array.isArray(line.preceding_tool_use_ids)
          ? line.preceding_tool_use_ids
          : [];
        const summaryText: string = typeof line.summary === 'string' ? line.summary : '';
        if (!summaryText) continue;
        for (const id of ids) {
          toolActivity.update(id, { outputSummary: summaryText });
        }
        continue;
      }
    }

    // ─── Stream drained — finalize ─────────────────────────────────────
    log.debug('stream drained, awaiting final result', { eventCount });

    // handle.result rejects for non-success subtypes (error_during_execution,
    // error_max_turns, etc.) and when the CLI exits without a result line.
    // These are normal outcomes — the turn completed, just with an error.
    // Catch gracefully so finalization (session persist, diff artifact,
    // writer close, queued drain) still runs.
    let result: { sessionId: string; text: string; totalCostUsd: number; durationMs: number };
    let resultError: string | undefined;
    try {
      result = await handle.result;
    } catch (resultErr: any) {
      resultError = resultErr?.message || 'CLI result unavailable';
      log.warn('CLI result error (non-fatal)', { message: resultError });
      // Extract session ID from ClaudeResultError if available.
      const errSessionId = resultErr?.sessionId ?? resultErr?.session_id ?? '';
      result = { sessionId: errSessionId, text: '', totalCostUsd: 0, durationMs: 0 };
    }
    log.debug('final result received', {
      sessionId: result.sessionId,
      textLen: result.text?.length ?? 0,
      costUsd: result.totalCostUsd,
      durationMs: result.durationMs,
      resultError: resultError ?? null,
    });

    if (result.sessionId) {
      persistClaudeState(services, threadId, {
        sessionId: result.sessionId,
        lastTurnAt: Date.now(),
      });
    }

    const hadToolErrors = resultError || toolActivity.entries.some(e => e.status === 'error');
    toolActivity.finalise(hadToolErrors ? 'error' : 'done');
    updateSessionArtifact(services, threadId, (prev) => ({
      status: 'idle',
      turns: (prev.turns ?? 0) + 1,
      totalCostUsd: (prev.totalCostUsd ?? 0) + (result.totalCostUsd ?? 0),
      lastTurnAt: Date.now(),
    }));

    // ─── Diff artifact ────────────────────────────────────────────────
    try {
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
      log.warn('diff artifact assembly failed', { message: diffErr?.message });
    }

    // Show the result error inline if the CLI reported one.
    const finalText = resultError
      ? `${writer.text}\n\n⚠️ ${resultError}`.trim()
      : (writer.text || result.text);
    writer.finalize(finalText);
    log.debug('stream consumer completed');

    // ─── Cleanup + drain ──────────────────────────────────────────────
    (services.cli as any).claudeCode.clearHandle(threadId);
    setRunning(services, threadId, false);
    await drainQueuedMessage(services, threadId, log);

  } catch (err: any) {
    const message = err?.message || 'Claude Code request failed';
    log.error('stream consumer failed', { message, stack: err?.stack });
    toolActivity.finalise('error');
    updateSessionArtifact(services, threadId, { status: 'idle' });
    writer.finalize(`${writer.text}\n\n⚠️ ${message}`.trim());

    (services.cli as any).claudeCode.clearHandle(threadId);
    setRunning(services, threadId, false);
    await drainQueuedMessage(services, threadId, log);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * If a message was queued while the stream was running, drain it by
 * re-invoking the chat action via `services.action.getAndExecute`.
 */
async function drainQueuedMessage(services: Services, threadId: EntityId, log: any): Promise<void> {
  const queued = dequeueMessage(services, threadId);
  if (!queued) return;

  log.debug('draining queued message', { threadId, textLen: queued.text?.length });
  if (queued.messageId) {
    services.chat.updateMessageState(queued.messageId as any, { status: null } as any);
  }

  try {
    await services.action.getAndExecute('Claude Code Chat', {
      threadId,
      text: queued.text,
      mode: queued.mode,
      phase: queued.phase,
      messageId: queued.messageId,
    });
  } catch (drainErr: any) {
    log.error('queued message drain failed', { message: drainErr?.message });
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
 * Derive a short human title for the diff artifact from the user's turn
 * message. First line, trimmed, truncated to ~60 chars.
 */
function deriveDiffTitle(userText: string): string {
  const firstLine = userText.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Claude Code changes';
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57) + '…';
}

/**
 * Normalise a `tool_result` block's `content` field to a plain string.
 */
function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(b => (b && typeof b === 'object' && 'text' in b ? String((b as { text?: unknown }).text ?? '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Strip the `<tool_use_error>…</tool_use_error>` envelope the CLI wraps
 * around tool-failure messages.
 */
function stripToolUseErrorEnvelope(raw: string): string {
  const m = raw.match(/^\s*<tool_use_error>([\s\S]*?)<\/tool_use_error>\s*$/);
  return m ? m[1].trim() : raw.trim();
}
