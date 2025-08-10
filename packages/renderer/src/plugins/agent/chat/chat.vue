<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Agent Chat Content -->
    <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
      <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
        <p class="text-gray-500">Start a conversation for this thread</p>
      </div>
      <div v-else class="w-9/12 py-2 mx-auto space-y-1">
        <ChatMessage 
          v-for="message in messages" 
          :key="message.id" 
          :message="message" 
        />
      </div>
    </div>
    <!-- @select-thread="(id: string) => send({ type: 'SELECT_THREAD', id })" -->
    <div class="flex-shrink-0 w-full" :class="$style.inputContainer">
      <ChatInput
    :current-thread="currentThread"
    :threads="threads"
    :current-mode="currentMode"
    @view-thread="(threadId: string) => actor.send({ type: 'VIEW_THREAD', threadId })"
    @open-thread-chat="(threadId: string) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
    @send-message="(text: string) => actor.send({ type: 'SEND_MESSAGE', text })"
      @new-thread="actor.send({ type: 'CLEAR_THREAD' })"
      @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
    />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';
import type { AgentThreadData, MessageEntity, ThreadEntity } from '@app/api'

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const threads = useSelector(actor, (state) => (state.context.threads || []) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
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
  min-height: 0;
}

.inputContainer {
  min-height: min-content;
}
</style> 