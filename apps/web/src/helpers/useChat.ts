// /apps/web/src/composables/useChat.ts
// import { useQueryClient } from '@tanstack/vue-query';
import { trpc } from '@agent/api';
import { ref } from 'vue';

export function useChat() {
  const sessionId = ref<string>();

  async function start(model = 'gpt-4o') {
    const res = await trpc.chat.openSession.mutate({ model });
    sessionId.value = res.sessionId;
    trpc.chat.onToken.subscribe({ sessionId: res.sessionId }, {
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