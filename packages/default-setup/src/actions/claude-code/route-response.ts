/**
 * CC: Route Response — writes a user's interactive block response back to the
 * CLI as a `control_response` via the stored query handle.
 *
 * Triggered by the flow's `interactive.message.response` listener track. The
 * action matches the incoming messageId against the thread's
 * `pendingControlRequest`, retrieves the stored CLI handle, and calls
 * `handle.respond()` to unblock the CLI. No ad-hoc brain listeners, no
 * polling, no side effects — pure state read + handle write.
 *
 * See `packages/default-setup/src/actions/claude-code/ROADMAP.md` and the
 * plan doc for the full architecture rationale.
 */

import type { ActionMeta, Services, EntityId } from '../../types';
import { getClaudeState, persistClaudeState, setRunning } from './_helpers/thread-context';
import { updateSessionArtifact } from './_helpers/session-artifact';
import { resolvePlanDraft } from './_helpers/plan-artifact';

export const meta: ActionMeta = {
  label: 'CC: Route Response',
  description: 'Routes interactive block responses (approval, choice) back to the Claude CLI as control_responses.',
  category: 'claude-code',
  input: {
    messageId: { type: 'string', description: 'The interactive block message that was responded to', required: true },
    threadId: { type: 'string', description: 'Thread ID (from event payload)', required: true },
    response: { type: 'object', description: 'The user response (shape depends on block type)', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
) {
  const { messageId, threadId, response } = params as {
    messageId: string;
    threadId: string;
    response: any;
  };

  if (!messageId || !threadId) {
    return { success: false, reason: 'missing messageId or threadId' };
  }

  const state = getClaudeState(services, threadId);
  const pending = state?.pendingControlRequest;

  if (!pending || pending.approvalMessageId !== messageId) {
    // No matching pending request — this response might be for a different
    // block type (e.g. a non-Claude-Code interaction) or the turn already
    // completed. Silently return so we don't break other block flows.
    return { success: false, reason: 'no matching pending control request' };
  }

  // Retrieve the stored CLI handle for this thread.
  const handle = (services.cli as any).claudeCode.getHandle(threadId);
  if (!handle) {
    return { success: false, reason: 'no active CLI handle for thread' };
  }

  // Only approval blocks can deny ({ approved: false } or { cancelled: true }).
  // Everything else (choice string, string[], wizard Record, text input) is an allow.
  const denied = response?.approved === false || response?.cancelled === true;
  const allow = !denied;

  // For AskUserQuestion, merge answers into updatedInput.
  // For tool approvals, echo the original request input verbatim.
  let updatedInput: Record<string, unknown> = pending.originalInput ?? {};
  if (pending.toolName === 'AskUserQuestion' && allow) {
    const isMultiAnswer = typeof response === 'object' && response !== null && !Array.isArray(response);
    let answers: Record<string, string>;
    if (isMultiAnswer) {
      // Multi-question wizard: response is already { questionText: answer }
      answers = response;
    } else {
      // Single question: wrap in a Record keyed by the question text
      const answer = typeof response === 'string' ? response
        : Array.isArray(response) ? response.join(', ')
        : String(response ?? '');
      const questionText = (Array.isArray(updatedInput.questions)
        ? (updatedInput.questions[0] as any)?.question : '') ?? '';
      answers = { [questionText]: answer };
    }
    updatedInput = { ...updatedInput, answers };
  }

  // Resolve plan drafts when ExitPlanMode is approved/rejected.
  if (pending.toolName === 'ExitPlanMode') {
    resolvePlanDraft(services, threadId as EntityId, allow ? 'approved' : 'rejected');
  }

  if (denied) {
    // Kill the turn immediately — don't send a deny message to the CLI.
    // The stream consumer's for-await loop will exit when the process dies.
    handle.kill();
    (services.cli as any).claudeCode.clearHandle(threadId);
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    setRunning(services, threadId, false);
    updateSessionArtifact(services, threadId as any, { status: 'idle' });
  } else {
    // Send the approval to the CLI and resume streaming.
    handle.respond(pending.requestId, { behavior: 'allow', updatedInput });
    persistClaudeState(services, threadId, { pendingControlRequest: undefined });
    setRunning(services, threadId, true);
    updateSessionArtifact(services, threadId as any, { status: 'streaming' });
  }

  return { success: true, allowed: allow };
}
