// /apps/web/src/composables/useChat.ts
// import { useQueryClient } from '@tanstack/vue-query';
import { trpc } from './chat';
import { ref, type Ref } from 'vue';

export function useChat() {
  const sessionId: Ref<string | undefined> = ref<string | undefined>();

  async function start(model = 'gpt-4o') {
    const { sessionId: newSessionId } = await trpc.chat.openSession.mutate({ model });
    sessionId.value = newSessionId;
    trpc.chat.onToken.subscribe({ sessionId: newSessionId }, {
      onData: (d) => tokens.value.push(d.token),
    });
  }

  const tokens = ref<string[]>([]);

  async function send(content: string) {
    if (!sessionId.value) return;
    await trpc.chat.userMessage.mutate({ sessionId: sessionId.value, content });
  }

  return { start, send, tokens };
}