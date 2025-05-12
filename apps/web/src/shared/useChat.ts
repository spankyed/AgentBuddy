// /apps/web/src/composables/useChat.ts
// import { useQueryClient } from '@tanstack/vue-query';
import { trpc } from './trpc';
import { ref, type Ref } from 'vue';

export function useChat() {
  const sessionId: Ref<string | undefined> = ref<string | undefined>();

  async function start(model = 'gpt-4o') {
    const { sessionId: newSessionId } = await trpc.api.openSession.mutate({ model });
    sessionId.value = newSessionId;
    trpc.api.onToken.subscribe({ sessionId: newSessionId }, {
      onData: (d) => tokens.value.push(d.token),
    });
  }

  const tokens = ref<string[]>([]);

  async function send(content: string) {
    if (!sessionId.value) return;
    await trpc.api.userMessage.mutate({ sessionId: sessionId.value, content });
  }

  return { start, send, tokens };
}