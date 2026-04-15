/**
 * Stream consumer — fire-and-forget async function that owns the `for await`
 * loop over a Claude Code CLI handle's event stream.
 *
 * Extracted from `chat.ts` so the chat action can return immediately after
 * starting the query. This function runs detached from the action lifecycle:
 * it processes all stream events, handles control_requests, and finalises
 * writers.
 *
 * Side effects are split between this consumer (ordering-critical state) and
 * flow actions (async-safe UI/artifact updates):
 * - Consumer: persistClaudeState, setRunning, writer/toolActivity, clearHandle,
 *   dequeueMessage → replayQueuedMessage (dequeue before setRunning to avoid race)
 * - Flow actions: updateSessionArtifact, diff artifact
 *   (triggered via cc.stream.* brain events → on() listeners in the flow)
 *
 * Error boundary: the entire body is wrapped in try/catch. Errors never
 * escape — the catch block logs, finalises writers, clears the handle, and
 * emits cc.stream.completed so the flow's Turn Completed action can clean up.
 */

import type { Services, EntityId } from '../../../types';
import { isPlanFileWrite } from './auto-approve';
import { createStreamWriter } from './stream-writer';
import { createToolActivityWriter } from './tool-activity-writer';
import { createPlanDraft } from './plan-artifact';
import { parseExitPlanModeInput, buildPlanApprovalContext } from './plan-approval';
import { parseAskUserQuestionInput } from './ask-user-question';
import { getClaudeState, persistClaudeState, setRunning, dequeueMessage } from './thread-context';
import { updateSessionArtifact } from './session-artifact';

/** Tools whose execution mutates files and should roll up into a diff artifact. */
const FILE_MUTATION_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * Sum per-model costUSD from the CLI's modelUsage map.
 * Falls back to 0 when the field is absent or malformed.
 */
function sumModelUsageCost(modelUsage: Record<string, any> | undefined): number {
  if (!modelUsage || typeof modelUsage !== 'object') return 0;
  let total = 0;
  for (const entry of Object.values(modelUsage)) {
    if (entry && typeof entry.costUSD === 'number') total += entry.costUSD;
  }
  return total;
}

export interface ConsumerContext {
  services: Services;
  threadId: EntityId;
  /** Original user message text — passed to cc.stream.completed for diff title. */
  text: string;
  phase?: string;
  /** The app's user message entity ID — used to store the CLI's user message UUID. */
  userMessageId?: string;
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

  // Track whether we've captured the CLI's user message UUID for this turn.
  // The first `user` event echoes the prompt with the UUID the CLI assigned.
  let userUuidTracked = false;

  // Extracted from the `result` line directly — survives even if handle.result
  // rejects (error subtypes like error_during_execution).
  let resultFromLine: { sessionId: string; text: string; totalCostUsd: number; durationMs: number } | undefined;

  /** Finalize the current message and create a new "Thinking…" placeholder. */
  function splitMessage() {
    writer.finalize(writer.text);
    services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);
    const segmentHadErrors = toolActivity.entries.some(e => e.status === 'error');
    toolActivity.finalise(segmentHadErrors ? 'error' : 'done');

    const msg = services.chat.sendBlockMessage({ threadId, text: 'Thinking…', blocks: [], forkable: false });
    log.debug('message split', { previousId: currentMessageId, nextId: msg.messageId });
    return {
      currentMessageId: msg.messageId as EntityId,
      writer: createStreamWriter(services, msg.messageId as EntityId, { intervalMs: 80 }),
      toolActivity: createToolActivityWriter(services, msg.messageId as EntityId, { intervalMs: 250, phase }),
    };
  }

  try {
    // ─── Drain the event stream ──────────────────────────────────────────
    let eventCount = 0;
    for await (const ev of handle.events) {
      const line = ev as any;
      eventCount++;
      if (eventCount <= 5 || eventCount % 20 === 0) {
        log.debug('stream event', { n: eventCount, type: line?.type });
      }

      // Split into a new message after approval/question answer — but only
      // when the CLI actually starts a new assistant message turn, not on
      // intermediate events (tool results, text deltas) that may arrive
      // between the approval and the stream resuming.
      const isMessageStart = line.type === 'assistant' || (line.type === 'stream_event' && (line as any).event?.type === 'message_start');
      if (splitOnNextMessageStart && isMessageStart) {
        splitOnNextMessageStart = false;
        ({ currentMessageId, writer, toolActivity } = splitMessage());
      }

      // First `system/init` event carries sessionId/model/cwd.
      if (line.type === 'system' && line.subtype === 'init') {
        if (line.session_id) {
          persistClaudeState(services, threadId, {
            sessionId: line.session_id,
            lastTurnAt: Date.now(),
          });
        }
        services.emitter.sendToBrainSystem({
          eventType: 'cc.stream.started',
          payload: {
            threadId,
            sessionId: line.session_id || '',
            model: line.model || '',
            cwd: line.cwd || '',
          },
        });
        continue;
      }

      if (line.type === 'stream_event') {
        // Anthropic text deltas.
        const delta = line.event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          writer.push(delta.text);
          continue;
        }
      }

      if (line.type === 'assistant') {
        // Track the CLI's message UUID so revert can use --resume-session-at.
        if (line.uuid) {
          services.chat.updateMessageState(currentMessageId as any, {
            context: { cliUuid: line.uuid },
          } as any);
        }
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
            // Update the session artifact's recent-tools list (last 3).
            updateSessionArtifact(services, threadId, (prev) => {
              const recent = (prev.recentTools ?? []).slice(-2);
              recent.push({ name: block.name, summary, at: Date.now() });
              return { recentTools: recent };
            });
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
        // Track the CLI's user message UUID (first user event per turn).
        // Needed for --rewind-files on revert-with-file-restore.
        if (!userUuidTracked && line.uuid && ctx.userMessageId) {
          services.chat.updateMessageState(ctx.userMessageId as any, {
            context: { cliUuid: line.uuid },
          } as any);
          userUuidTracked = true;
        }
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

        // Reject malformed requests missing a tool name.
        if (!req.tool_name) {
          log.warn('control_request missing tool_name, denying', { requestId });
          handle.respond(requestId, { behavior: 'deny', message: 'Invalid request: missing tool_name' });
          continue;
        }

        // Auto-approve plan-file writes during plan phase.
        if (phase === 'plan' && req.subtype === 'can_use_tool' && isPlanFileWrite(req.tool_name, req.input)) {
          log.debug('auto-approved plan-file write', { tool: req.tool_name });
          handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
          continue;
        }

        // Auto-approve file edits when user opted in mid-turn via the checkbox.
        if (req.subtype === 'can_use_tool' && FILE_MUTATION_TOOLS.has(req.tool_name)) {
          const ccState = getClaudeState(services, threadId);
          if (ccState?.autoAcceptEdits) {
            log.debug('auto-approved file edit (mid-turn opt-in)', { tool: req.tool_name });
            handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
            continue;
          }
        }

        // Freeze the tool-activity block so it stops showing "Working…".
        writer.flush();
        toolActivity.finalise('done');

        // Send the appropriate interactive block.
        let approvalMessageId: string;

        if (req.tool_name === 'ExitPlanMode') {
          const parsed = parseExitPlanModeInput(req.input ?? {});
          // Grab git branch + PR for the plan header (best-effort, non-blocking).
          let planBranch: string | undefined;
          let planPR: string | undefined;
          try {
            planBranch = await services.cli.git.getCurrentBranch();
            const pr = await services.cli.gh.getPRForBranch(planBranch);
            if (pr?.number) planPR = String(pr.number);
          } catch { /* non-critical */ }
          createPlanDraft(services, threadId, parsed.plan, 'Implementation Plan', {
            branch: planBranch,
            prNumber: planPR,
          });
          const planContext = buildPlanApprovalContext(parsed);
          const approval = services.chat.sendBlockMessage({
            threadId,
            text: 'Claude Code is ready to implement — review the plan and approve.',
            blocks: [
              { type: 'markdown', props: { content: planContext, label: 'Plan' } },
              { type: 'prompt', props: { content: 'Approve this plan and start implementing?' } },
              { type: 'approval', props: {
                options: [
                  { label: 'Yes, clear context and auto-accept edits', variant: 'primary', flags: { clearContext: true, autoAccept: true } },
                  { label: 'Yes, auto-accept edits', variant: 'secondary', flags: { autoAccept: true } },
                  { label: 'Deny', variant: 'neutral', flags: { approved: false } },
                ],
              } },
            ],
            forkable: false,
            autoHide: true,
          });
          approvalMessageId = approval.messageId;
        } else if (req.tool_name === 'AskUserQuestion') {
          const { questions } = parseAskUserQuestionInput(req.input ?? {});
          // Guard: if the CLI sends an AskUserQuestion with no parseable questions,
          // auto-approve rather than rendering an empty block.
          if (questions.length > 0) {
            const questionMsg = (services.chat as any).sendQuestionBlock({
              threadId,
              text: questions[0].question,
              prompt: questions[0].header || 'Select an option',
              questions: questions.map(q => ({
                question: q.question,
                header: q.header,
                options: q.options.map(o => ({ id: o.label, label: o.label, description: o.description || undefined })),
                multiSelect: q.multiSelect,
                allowCustom: true,
              })),
              forkable: false,
              autoHide: true,
            });
            approvalMessageId = questionMsg.messageId;
          } else {
            handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
            continue;
          }
        } else {
          const approval = services.chat.sendBlockMessage({
            threadId,
            text: `Claude Code wants to run ${req.tool_name}`,
            blocks: [
              { type: 'prompt', props: { content: `Allow \`${req.tool_name}\`?` } },
              { type: 'tool-input' as any, props: { toolName: req.tool_name, input: req.input } },
              { type: 'approval', props: { requireReason: false, allowReason: true, autoAcceptOption: FILE_MUTATION_TOOLS.has(req.tool_name) } },
            ],
            forkable: false,
            autoHide: true,
          });
          approvalMessageId = approval.messageId;
        }

        log.debug('interactive block sent for control_request', {
          requestId,
          toolName: req.tool_name,
          approvalMessageId,
        });

        // Critical state: must be set before user can respond.
        persistClaudeState(services, threadId, {
          pendingControlRequest: {
            requestId,
            approvalMessageId,
            toolName: req.tool_name ?? 'unknown',
            originalInput: req.input ?? {},
          },
        });
        setRunning(services, threadId, false);

        splitOnNextMessageStart = true;
        // Emit to flow → CC: Stream Paused action updates artifact status.
        services.emitter.sendToBrainSystem({
          eventType: 'cc.stream.paused',
          payload: { threadId, toolName: req.tool_name ?? 'unknown' },
        });
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

      // The `result` event is the CLI's terminal signal. Extract cost/duration
      // directly — handle.result may reject for error subtypes, losing this data.
      if (line.type === 'result') {
        log.debug('result line received', {
          total_cost_usd: (line as any).total_cost_usd,
          modelUsage: (line as any).modelUsage ? Object.keys((line as any).modelUsage) : undefined,
          duration_ms: (line as any).duration_ms,
        });
        resultFromLine = {
          sessionId: (line as any).session_id ?? '',
          text: (line as any).result ?? '',
          totalCostUsd: (line as any).total_cost_usd || sumModelUsageCost((line as any).modelUsage),
          durationMs: (line as any).duration_ms ?? 0,
        };
        break;
      }
    }

    // ─── Stream drained — finalize ─────────────────────────────────────
    // Use the result data extracted directly from the result line in the loop.
    // No need to await handle.result — it may reject for error subtypes
    // (error_during_execution, etc.) or SIGTERM kills, losing cost/duration.
    const result = resultFromLine ?? { sessionId: '', text: '', totalCostUsd: 0, durationMs: 0 };
    log.debug('stream drained', {
      eventCount,
      sessionId: result.sessionId,
      costUsd: result.totalCostUsd,
      durationMs: result.durationMs,
    });

    // Critical state: persist sessionId for resume.
    if (result.sessionId) {
      persistClaudeState(services, threadId, {
        sessionId: result.sessionId,
        lastTurnAt: Date.now(),
      });
    }

    // Finalize writers (needs closure references).
    const hadToolErrors = toolActivity.entries.some(e => e.status === 'error');
    toolActivity.finalise(hadToolErrors ? 'error' : 'done');
    writer.finalize(writer.text || result.text);
    // Completed message becomes forkable.
    services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);
    log.debug('stream consumer completed');

    // Close stdin so the CLI process exits cleanly (prevents child leak).
    try { await handle.close(); } catch (closeErr: any) {
      log.debug('handle.close failed', { message: closeErr?.message });
    }

    // Critical cleanup: clear handle, mark not running, reset mid-turn flags, drain queue.
    // Dequeue before setRunning(false) to close the race window where a new
    // message could interleave between the two calls.
    (services.cli as any).claudeCode.clearHandle(threadId);
    const queued = dequeueMessage(services, threadId);
    persistClaudeState(services, threadId, { isRunning: false, autoAcceptEdits: undefined });
    if (queued) await replayQueuedMessage(services, threadId, queued, log);

    // Emit to flow → CC: Turn Completed action handles:
    //   updateSessionArtifact, diff artifact
    services.emitter.sendToBrainSystem({
      eventType: 'cc.stream.completed',
      payload: {
        threadId,
        sessionId: result.sessionId,
        costUsd: result.totalCostUsd,
        durationMs: result.durationMs,
        toolCallCount: toolActivity.entries.length,
        mutatedFileCount: mutatedPaths.length,
        mutatedPaths,
        hadErrors: !!hadToolErrors,
        userText: text,
      },
    });

  } catch (err: any) {
    const message = err?.message || 'Claude Code request failed';

    // If pause-turn already ran (isRunning=false), the kill was intentional.
    // Finalize writers cleanly and skip cleanup — pause-turn handled it.
    const state = getClaudeState(services, threadId);
    if (!state?.isRunning) {
      log.debug('stream consumer exiting — turn was paused');
      const segmentHadErrors = toolActivity.entries.some(e => e.status === 'error');
      toolActivity.finalise(segmentHadErrors ? 'error' : 'done');
      writer.finalize(writer.text || undefined);
      services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);
      return;
    }

    // Real error — not a user-initiated pause.
    log.error('stream consumer failed', { message, stack: err?.stack });
    toolActivity.finalise('error');
    writer.finalize(`${writer.text}\n\n⚠️ ${message}`.trim());
    services.chat.updateMessageState(currentMessageId as any, { forkable: true } as any);

    // Kill the CLI process on error (it may be in a bad state).
    try { handle.kill(); } catch { /* already gone */ }

    // Critical cleanup — dequeue before setRunning(false) to avoid race.
    (services.cli as any).claudeCode.clearHandle(threadId);
    const queued = dequeueMessage(services, threadId);
    persistClaudeState(services, threadId, { isRunning: false, autoAcceptEdits: undefined });
    if (queued) await replayQueuedMessage(services, threadId, queued, log);

    // Emit to flow → CC: Turn Completed action handles:
    //   updateChatState(services, threadId, 'idle')
    services.emitter.sendToBrainSystem({
      eventType: 'cc.stream.completed',
      payload: { threadId, hadErrors: true, error: message },
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Replay a previously-dequeued message by re-invoking the chat action.
 *
 * The caller dequeues the message *before* calling `setRunning(false)` so
 * there is no race window where a new incoming message could interleave.
 */
async function replayQueuedMessage(
  services: Services,
  threadId: EntityId,
  queued: { text: string; mode?: string; phase?: string; messageId?: string; references?: any },
  log: any,
): Promise<void> {
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
      references: queued.references,
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
