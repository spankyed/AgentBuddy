/**
 * Stream consumer for Hermes agent responses.
 *
 * Handles high-frequency streaming inline (tokens, tool blocks) and fires
 * a single brain event at lifecycle boundaries (started/done/error) for
 * the flow-routed `Hermes: Stream Lifecycle` action.
 */

import type { Services } from '../../../types';

interface StreamConsumerOptions {
  threadId: string;
  services: Services;
}

export function createStreamConsumer({ threadId, services }: StreamConsumerOptions) {
  let currentMessageId: string | null = null;
  let accumulatedText = '';
  let toolActivities: Array<{ name: string; toolCallId: string; status: 'running' | 'done' }> = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  function flushText() {
    if (!currentMessageId || !accumulatedText) return;
    services.chat.updateMessageState(currentMessageId as any, { text: accumulatedText } as any);
  }

  function scheduleFlush() {
    if (flushTimeout) return;
    flushTimeout = setTimeout(() => { flushTimeout = null; flushText(); }, 80);
  }

  function fireLifecycle(eventType: string, payload: Record<string, unknown> = {}) {
    services.emitter.sendToBrainSystem({
      eventType: 'hermes.stream.lifecycle',
      payload: { eventType, threadId, ...payload },
    });
  }

  function updateToolBlock(label: string) {
    if (!currentMessageId) return;
    services.chat.updateMessageState(currentMessageId as any, {
      text: accumulatedText || label,
      blocks: [{
        type: 'tool-activity',
        props: {
          label,
          state: toolActivities.every(t => t.status === 'done') ? 'done' : 'streaming',
          entries: toolActivities.map(t => ({
            id: t.toolCallId,
            tool: t.name,
            summary: t.name,
            status: t.status === 'done' ? 'ok' : 'running',
          })),
        },
      }],
    } as any);
  }

  return function onEvent(type: string, data: Record<string, unknown>) {
    switch (type) {
      case 'stream_start': {
        const msg = services.chat.sendBlockMessage({
          threadId: threadId as any, text: 'Thinking\u2026', blocks: [], forkable: false,
        });
        currentMessageId = msg?.messageId ?? null;
        accumulatedText = '';
        toolActivities = [];
        fireLifecycle('started', { streamId: data.streamId });
        break;
      }

      case 'token': {
        const text = data.text as string;
        if (text) { accumulatedText += text; scheduleFlush(); }
        break;
      }

      case 'tool_start': {
        toolActivities.push({ name: data.name as string, toolCallId: data.toolCallId as string, status: 'running' });
        updateToolBlock(`Running ${data.name}\u2026`);
        break;
      }

      case 'tool_complete': {
        const activity = toolActivities.find(t => t.toolCallId === data.toolCallId);
        if (activity) activity.status = 'done';
        const allDone = toolActivities.every(t => t.status === 'done');
        updateToolBlock(allDone ? `Used ${toolActivities.length} tool${toolActivities.length > 1 ? 's' : ''}` : 'Running tools\u2026');
        break;
      }

      case 'tool_call': {
        updateToolBlock(`Using ${data.name}\u2026`);
        break;
      }

      case 'done': {
        if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
        if (data.finalResponse) accumulatedText = data.finalResponse as string;
        flushText();
        fireLifecycle('done', {
          messageId: currentMessageId,
          sessionId: data.sessionId,
          finalResponse: accumulatedText,
        });
        break;
      }

      case 'stream_error': {
        if (flushTimeout) { clearTimeout(flushTimeout); flushTimeout = null; }
        flushText();
        fireLifecycle('error', { errorMessage: (data.message as string) || 'Unknown error' });
        break;
      }

      case 'approval': {
        const question = (data.question as string) || 'The agent requires your approval to proceed.';
        services.chat.sendApprovalBlock({
          threadId: threadId as any,
          text: question,
          prompt: 'Do you want to approve this action?',
          context: data.context as string,
          autoHide: true,
          asUser: true,
        } as any);
        fireLifecycle('paused', {});
        break;
      }

      case 'clarify': {
        const q = (data.question as string) || 'The agent needs clarification.';
        const choices = (data.choices as string[]) || [];
        services.chat.sendChoiceBlock({
          threadId: threadId as any,
          text: q,
          prompt: q,
          choices: (choices.length > 0 ? choices : ['Continue', 'Cancel']).map((c: string) => ({ id: c, label: c })),
          forkable: false,
          autoHide: true,
          asUser: true,
        } as any);
        fireLifecycle('paused', {});
        break;
      }
    }
  };
}
