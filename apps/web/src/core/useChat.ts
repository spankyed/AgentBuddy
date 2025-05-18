import { trpc } from './trpc';
import { ref, onUnmounted } from 'vue';

export function useChat() {
  const tokens = ref<string[]>([]);
  let subscription: ReturnType<typeof trpc.bus.sub.subscribe> | undefined;

  async function start() {
    // Subscribe to events from the shared actor
    subscription = trpc.bus.sub.subscribe(
      undefined,
      {
        onData: (event) => {
          if (event.type === 'TOKEN') {
            tokens.value.push(event.token);
          }
        },
      }
    );
  }

  async function send(content: string) {
    await trpc.bus.send.mutate({ type: 'USER_MSG', content, systemId: 'agent' });
  }

  onUnmounted(() => {
    subscription?.unsubscribe();
  });

  return { start, send, tokens };
}