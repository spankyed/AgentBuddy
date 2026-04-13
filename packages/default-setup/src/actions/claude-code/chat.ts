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
// awaitMessageResponse DELETED — control_requests are surfaced in the stream
// and routed via the flow's "CC: Route Response" action.
import { isPlanFileWrite } from './_helpers/auto-approve';
import { createStreamWriter } from './_helpers/stream-writer';
import { createToolActivityWriter } from './_helpers/tool-activity-writer';
import { ensureSessionArtifact, updateSessionArtifact, readSessionPermissionMode } from './_helpers/session-artifact';
import { createPlanDraft } from './_helpers/plan-artifact';
import { parseExitPlanModeInput, buildPlanApprovalContext } from './_helpers/plan-approval';
import { parseAskUserQuestionInput } from './_helpers/ask-user-question';
import { parseUnifiedDiff } from './_helpers/parse-diff';
import { getClaudeState, persistClaudeState, setRunning, enqueueMessage, dequeueMessage } from './_helpers/thread-context';

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
    messageId: { type: 'string', description: 'User message entity ID (for queued-state UI)', required: false },
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
    messageId: userMessageId,
  } = params as {
    threadId: EntityId;
    text: string;
    mode?: string;
    phase?: string;
    model?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    systemPrompt?: string;
    messageId?: string;
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

  // ─── Concurrency guard ──────────────────────────────────────────────
  if (prior?.isRunning) {
    // CLI is actively streaming — queue the new message for the drain.
    log.debug('action already running — queuing message', { threadId });
    enqueueMessage(services, threadId, { text, mode: params.mode as string, phase, messageId: userMessageId });
    if (userMessageId) {
      services.chat.updateMessageState(userMessageId as any, { status: 'queued' } as any);
    }
    return { success: true, queued: true };
  }

  // If the turn is paused on a permission prompt (isRunning=false but
  // pendingControlRequest exists), kill the old CLI process so the old
  // action exits cleanly, then proceed with this message as a new turn.
  if (prior?.pendingControlRequest) {
    log.debug('killing paused turn to start new one', { threadId });
    const oldHandle = (services.cli as any).claudeCode.getHandle(threadId);
    if (oldHandle) {
      oldHandle.kill();
      (services.cli as any).claudeCode.clearHandle(threadId);
    }
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    // Fall through — proceed as a new turn with resume: sessionId
  }

  // Mark this thread as having an active turn.
  setRunning(services, threadId, true);

  // Create the empty assistant message we'll stream into. Writers are
  // reassigned when a user interaction (approval, question) triggers a
  // message split — see the `splitOnNextMessageStart` flag below.
  let currentMessageId = services.chat.sendBlockMessage({
    threadId,
    text: '',
    blocks: [],
  }).messageId;
  log.debug('placeholder message created', { messageId: currentMessageId });

  let writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
  let toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250 });

  // Set by onPermissionRequest after a user-interactive flow (approval,
  // question answer). The next `message_start` will split into a new
  // message. Auto-approved tools (Read, Glob, Grep, plan-file writes)
  // do NOT set this — their tool chains stay in one message.
  let splitOnNextMessageStart = false;

  // Track file-mutation paths across all messages for the diff artifact.
  // After message splitting, `toolActivity.entries` only sees the LAST
  // message's entries, so we accumulate mutated paths as tools are appended.
  const mutatedPathsSet = new Set<string>();
  const mutatedPaths: string[] = [];

  // Upsert the thread's claude-session artifact so the right-panel card
  // appears immediately and transitions to 'streaming'. sessionId/model/cwd
  // are filled in on the first system/init event inside the stream loop.
  ensureSessionArtifact(services, threadId, {
    status: 'streaming',
    startedAt: Date.now(),
  });
  updateSessionArtifact(services, threadId, { status: 'streaming' });

  // Read the user's current permission-mode choice from the session
  // artifact (set via the segmented control on the right panel card).
  // Falls back to 'default' for brand-new threads.
  const activePermissionMode = readSessionPermissionMode(services, threadId);
  // When the user selects plan phase in the UI, ensure the CLI enters
  // plan mode so ExitPlanMode is exposed. The phase selector and the
  // permission-mode segmented control are independent UI widgets — this
  // bridges them so the user doesn't have to click both.
  const effectivePermissionMode = phase === 'plan' ? 'plan' : activePermissionMode;
  log.debug('active permission mode', { permissionMode: effectivePermissionMode });

  // Phase-aware system-prompt nudging (plan/edit/review).
  const phaseHint = phase ? PHASE_HINTS[phase] : undefined;
  const composedSystemPrompt = [phaseHint, systemPrompt].filter(Boolean).join('\n\n') || undefined;

  // ─── Fire the query (surfaced control_requests) ─────────────────────────
  // Control_requests appear in the event stream (surfaceControlRequests: true)
  // instead of being routed through an onPermissionRequest callback. The
  // flow's `interactive.message.response` listener + "CC: Route Response"
  // action handles routing the user's approval/choice back to the CLI via
  // handle.respond(). No ad-hoc brain listeners. No awaitMessageResponse.
  // No timeouts. The for-await loop blocks naturally while waiting.
  //
  // OLD onPermissionRequest callback was ~300 lines handling auto-approve,
  // AskUserQuestion, ExitPlanMode, and generic approval — all with inline
  // awaitMessageResponse calls. Replaced by ~50 lines of inline control_request
  // handling in the stream loop below, with response routing in the flow.
  // ─── Fire the query (surfaced control_requests) ─────────────────────────
  try {
    log.debug('invoking claudeCode.query', {
      model,
      resumeSessionId: resumeSessionId ?? null,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      hasSystemPrompt: !!composedSystemPrompt,
    });
    const handle = await services.cli.claudeCode.query({
      prompt: text,
      resume: resumeSessionId,
      model,
      includePartialMessages: true,
      permissionMode: effectivePermissionMode,
      allowedTools: allowedTools ?? DEFAULT_ALLOWED_TOOLS,
      disallowedTools,
      systemPrompt: composedSystemPrompt,
      surfaceControlRequests: true,
      // NO onPermissionRequest — control_requests appear in the event stream.
      // The flow's `interactive.message.response` listener + "CC: Route Response"
      // action handles routing the user's response back to the CLI via
      // handle.respond(). No ad-hoc brain listeners. No timeouts.
    } as any);

    // Store the handle so "CC: Route Response" (another action in the flow)
    // can write control_responses back to the CLI's stdin.
    (services.cli as any).claudeCode.storeHandle(threadId, handle);

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
        // Persist session ID to thread context IMMEDIATELY so any subsequent
        // invocation on the same thread (e.g. user sends a new message while
        // a permission handler is blocking) can resume the correct session.
        // Without this, persistClaudeState only ran after the entire stream
        // drained (line ~628), which was too late if a second message arrived
        // during a long-running approval/question flow. The late persist at
        // line ~628 is now redundant but kept for belt-and-suspenders safety
        // (idempotent — writes the same session ID again with a fresh
        // lastTurnAt reflecting end-of-turn time).
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
        // Split into a new message only when `onPermissionRequest`
        // flagged a user interaction (approval, question answer).
        // Auto-approved tool chains (Read → Grep → Read) stay in
        // one message — no flag, no split.
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

          const { messageId: nextId } = services.chat.sendBlockMessage({
            threadId,
            text: '',
            blocks: [],
          });
          log.debug('message split after user interaction', { previousId: currentMessageId, nextId });
          currentMessageId = nextId;
          writer = createStreamWriter(services, currentMessageId, { intervalMs: 80 });
          toolActivity = createToolActivityWriter(services, currentMessageId, { intervalMs: 250 });
        }

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
            // ExitPlanMode is a meta-signal ("ready to exit plan mode")
            // rather than an operational tool the user cares about
            // logging. The plan artifact and dedicated plan-approval
            // block (see onPermissionRequest branch above) are the
            // real UX — don't also clutter the tool-activity block
            // with a row, and don't bump the session tool counter.
            if (block.name === 'ExitPlanMode') continue;

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
            // Track file-mutation paths across message boundaries for the
            // diff artifact. After splitting, `toolActivity.entries` only
            // sees the current message's entries.
            if (FILE_MUTATION_TOOLS.has(block.name) && block.input) {
              const p = (block.input as any).file_path || (block.input as any).path;
              if (typeof p === 'string' && !mutatedPathsSet.has(p)) {
                mutatedPathsSet.add(p);
                mutatedPaths.push(p);
              }
            }
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

      if (line.type === 'user') {
        // Tool results flow back on `user`-role messages. The CLI wraps every
        // tool outcome (success or failure) as a `tool_result` content block
        // with `is_error` indicating failure and `content` carrying either
        // the result payload (success) or a `<tool_use_error>…</tool_use_error>`
        // envelope (failure). See leaked CLI source:
        //   src/services/tools/toolExecution.ts:400,479 (success + failure shapes)
        //   src/services/tools/StreamingToolExecutor.ts:351 (is_error === true filter)
        //
        // Before this branch existed, tool failures were silently dropped:
        // entries stayed in 'running' until finalise() force-flipped them
        // to 'ok', so a failing Edit rendered as a fake green checkmark.
        // Now we own status transitions for both the success and failure
        // cases; tool_use_summary only sets the outputSummary text.
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
      // The CLI is asking for permission. Send an interactive block to the
      // user, store the request details, mark the turn as paused, and
      // continue the loop. The next for-await iteration blocks naturally
      // because the CLI produces no more stdout events until it receives
      // the control_response (written by "CC: Route Response" via the
      // stored handle). No callbacks, no listeners, no timeouts.
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
          // Plan approval — create the plan artifact + send a plan-specific block.
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
          // Clarifying question — send a choice block for the first question.
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
            // No parseable questions — auto-approve.
            handle.respond(requestId, { behavior: 'allow', updatedInput: req.input });
            continue;
          }
        } else {
          // Generic tool approval (Write, Edit, Bash, etc.)
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

        // Store the request details so "CC: Route Response" can match the
        // user's response back to the CLI's request_id.
        persistClaudeState(services, threadId, {
          pendingControlRequest: {
            requestId,
            approvalMessageId,
            toolName: req.tool_name ?? 'unknown',
            originalInput: req.input ?? {},
          },
        });

        // Mark the turn as paused — the CLI is idle, waiting for our
        // control_response. New messages should NOT be queued (isRunning=false),
        // they should start a new turn (the concurrency guard above checks
        // pendingControlRequest and kills the old CLI if present).
        setRunning(services, threadId, false);
        updateSessionArtifact(services, threadId, { status: 'awaiting-permission' });
        splitOnNextMessageStart = true;

        // The for-await loop continues to the next iteration, which blocks
        // naturally — the CLI produces no more events until it gets the
        // control_response from "CC: Route Response".
        continue;
      }

      // ─── Control cancellation (surfaced by pump) ───────────────────
      // The CLI withdrew a pending control_request (e.g. internal timeout).
      // Clear the stale pending state so we don't try to respond later.
      if (line.type === 'control_cancel_request') {
        log.debug('control_cancel_request received, clearing pending state');
        persistClaudeState(services, threadId, { pendingControlRequest: undefined });
        continue;
      }

      if (line.type === 'tool_use_summary') {
        // CLI reports a summary string covering one or more prior tool_uses.
        // Apply it as supplementary outputSummary text ONLY — status
        // transitions are owned by the `user`/tool_result handler above.
        // Touching status here would race with tool_result and could
        // incorrectly mark a failed tool as 'ok' depending on CLI ordering.
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

    // Upgrade the block-level state to 'error' if any tool call failed —
    // ToolActivityBlock.vue auto-opens the collapsed details on the
    // streaming→error transition so the user sees the failure without
    // having to click into the block.
    const hadToolErrors = toolActivity.entries.some(e => e.status === 'error');
    toolActivity.finalise(hadToolErrors ? 'error' : 'done');
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
      // `mutatedPaths` is accumulated across all message boundaries (see
      // the tool_use handler above) so the diff covers the whole turn.
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

    // Plan artifacts are now created inline during ExitPlanMode approval
    // (see the `req.tool_name === 'ExitPlanMode'` branch in
    // onPermissionRequest above), not after the result lands. The prior
    // Phase D-min post-result stub used `result.text` as the plan body,
    // which by the time `result` arrives in the plan-mode happy path is
    // actually the post-implementation summary — wrong content. Removed.

    writer.finalize(writer.text || result.text);
    log.debug('chat action completed');

    // ─── Drain queued message (concurrency guard: F5) ─────────────────
    // Clear the stored handle — the CLI process is done.
    (services.cli as any).claudeCode.clearHandle(threadId);

    // If a new message was queued while this turn was running, process it
    // now via recursive self-call. Session ID is already persisted, so
    // the recursive call resumes the correct conversation.
    setRunning(services, threadId, false);
    const queued = dequeueMessage(services, threadId);
    if (queued) {
      log.debug('draining queued message', { threadId, textLen: queued.text?.length });
      // Clear the "queued" status indicator on the user's message before
      // processing it, so the amber dot disappears as the turn starts.
      if (queued.messageId) {
        services.chat.updateMessageState(queued.messageId as any, { status: null } as any);
      }
      return action(
        { threadId, text: queued.text, mode: queued.mode, phase: queued.phase, messageId: queued.messageId },
        services,
        _z,
        _flowId,
      );
    }

    return {
      success: true,
      sessionId: result.sessionId,
      messageId: currentMessageId,
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

    // Clear the stored handle — the CLI process is done (or dead).
    (services.cli as any).claudeCode.clearHandle(threadId);

    // ─── Drain queued message on error (concurrency guard: F5) ────────
    setRunning(services, threadId, false);
    const queuedOnError = dequeueMessage(services, threadId);
    if (queuedOnError) {
      log.debug('draining queued message after error', { threadId });
      if (queuedOnError.messageId) {
        services.chat.updateMessageState(queuedOnError.messageId as any, { status: null } as any);
      }
      return action(
        { threadId, text: queuedOnError.text, mode: queuedOnError.mode, phase: queuedOnError.phase, messageId: queuedOnError.messageId },
        services,
        _z,
        _flowId,
      );
    }

    // Intentionally NOT clearing thread.context on error — the session may
    // still be valid on disk; let the user retry or call the reset action
    // explicitly.
    return { success: false, error: message, messageId: currentMessageId };
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

/**
 * Normalise a `tool_result` block's `content` field to a plain string.
 * The Claude Code CLI emits two shapes depending on tool output:
 *   - string: plain result text (most tools)
 *   - array:  [{ type:'text', text:'...' }, ...] for multi-part results
 * Anything else (null, number, unexpected shape) flattens to an empty
 * string so the downstream display logic doesn't have to branch again.
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
 * around tool-failure messages (see leaked CLI source at
 * `src/services/tools/toolExecution.ts:479-481`). Leaves the human
 * readable error text unwrapped. Non-envelope inputs pass through
 * unchanged (with whitespace trimmed).
 */
function stripToolUseErrorEnvelope(raw: string): string {
  const m = raw.match(/^\s*<tool_use_error>([\s\S]*?)<\/tool_use_error>\s*$/);
  return m ? m[1].trim() : raw.trim();
}
