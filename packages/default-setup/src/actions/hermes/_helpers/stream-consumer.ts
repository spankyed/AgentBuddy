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
        props: { label, tools: toolActivities.map(t => ({ name: t.name, status: t.status })) },
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
    }
  };
}
