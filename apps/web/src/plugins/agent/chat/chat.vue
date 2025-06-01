<template>
  <!-- Agent Chat Content -->
  <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
    <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
      <p class="text-gray-500">Start a conversation for this thread</p>
    </div>
    <div v-else class="w-9/12 pt-2 mx-auto space-y-2">
      <ChatMessage 
        v-for="message in messages" 
        :key="message.id" 
        :message="message" 
      />
    </div>
  </div>
  <!-- @select-thread="(id: string) => send({ type: 'SELECT_THREAD', id })" -->
  <ChatInput
    @send-message="(text: string) => actor.send({ type: 'SEND_MESSAGE', text })"
    @new-thread="actor.send({ type: 'CLEAR_MESSAGES' })"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => state.context.messages)
const messagesContainer = ref<HTMLElement | null>(null)

watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })
</script>

<style lang="scss" module>
.messagesContainer {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scroll-behavior: smooth;
}
</style> 