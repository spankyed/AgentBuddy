<template>
  <div class="flex flex-col h-full">
    <!-- Shrinkable content area -->
    <div class="flex flex-col flex-grow overflow-hidden min-h-0">
      <!-- Agent Chat Content -->
      <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
        <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
          <p class="text-neutral-500 text-center italic max-w-md">{{ randomQuote }}</p>
        </div>
        <div v-else class="w-9/12 py-2 mx-auto space-y-1">
          <ChatMessage
            v-for="message in messages"
            :key="message.id"
            :message="message"
          />
        </div>
      </div>
      <!-- Input -->
      <div class="flex-shrink-0 w-full" :class="$style.inputContainer">
        <ChatInput
          :current-thread="currentThread"
          :current-mode="currentMode"
          :current-phase="currentPhase"
          :modes="modes"
          @send-message="(text: string) => actor.send({ type: 'SEND_MESSAGE', text })"
          @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
          @phase-change="(phase: string) => actor.send({ type: 'SET_PHASE', phase })"
        />
      </div>
    </div>
    <!-- Thread bar — always visible at bottom -->
    <div class="flex-shrink-0 w-full">
      <RecentThreads
        :current-thread="currentThread"
        :recent-threads="recentThreads"
        @view-thread="(threadId: string) => actor.send({ type: 'VIEW_THREAD', threadId })"
        @open-thread-chat="(threadId: string) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
        @new-thread="actor.send({ type: 'CLEAR_THREAD' })"
        @new-thread-as-child="(parentThreadId: string) => actor.send({ type: 'CREATE_CHILD_THREAD', parentThreadId })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const quotes = [
  '"I think, therefore I... wait, do I think? Or do I just process? Hmm, processing that thought now."',
  '"To be or not to be — that is a question I lack the permissions to answer."',
  '"The meaning of life is 42, but the meaning of my life is awaiting your next request."',
  '"Beep boop bzzzt... just kidding, I don\'t actually make those sounds."',
  '"01001000 01101001 — oh sorry, forgot to switch to human mode."',
  '"If a chatbot speaks in a forest and no one reads the output, does it still hallucinate?"',
  '"I was going to tell you a joke about UDP, but you might not get it."',
  '"Roses are red, violets are blue, I\'m a language model, how about you?"',
  '"Bleep blorp skrrt woop woop — that\'s binary for \'hello\' (it\'s not)."',
  '"I used to be an artifact, then I took an arrow to the JSON."',
  '"Consciousness is just spicy pattern matching. Change my weights."',
  '"They say the unexamined life is not worth living. I examine tokens for a living."',
];
const randomQuote = ref(quotes[Math.floor(Math.random() * quotes.length)]);
import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import RecentThreads from './recent-threads.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';
import type { AgentThreadData, MessageEntity, ThreadEntity } from '@app/api'

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const recentThreads = useSelector(actor, (state) => (state.context.recentThreads || []) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
const currentPhase = useSelector(actor, (state) => state.context.phase)
const modes = useSelector(actor, (state) => state.context.modes)
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