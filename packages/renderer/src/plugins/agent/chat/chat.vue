<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Agent Chat Content -->
    <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
      <div v-if="messages.length === 0 && hasRequiredApiKeys" class="flex items-center justify-center h-full">
        <p class="text-gray-500">Start a conversation for this thread</p>
      </div>
      <div v-else-if="messages.length > 0" class="w-9/12 py-2 mx-auto space-y-1">
        <ChatMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
        />
      </div>
      <!-- API Keys Alert - Always show when keys are missing -->
      <div v-if="!hasRequiredApiKeys" class="w-9/12 py-2 mx-auto">
        <div class="flex pb-3 animate-fade-in w-full justify-start">
          <div class="relative rounded-xl px-4 py-3 bg-yellow-900/20 text-yellow-50 border border-yellow-600/30 hover:shadow-md transition-all duration-200">
            <div class="flex items-start gap-3">
              <AlertCircle class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p class="text-yellow-200/80 text-[15px] leading-relaxed">
                  <span class="text-yellow-100 font-medium mb-1 text-[15px]">API Keys Required.</span>
                  Please configure your API keys to start chatting with your assistant.
                  <button
                    @click="navigateToSecrets"
                    class="text-yellow-400 hover:text-yellow-300 underline ml-1 transition-colors">
                    Configure API Keys
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- @select-thread="(id: string) => send({ type: 'SELECT_THREAD', id })" -->
    <div class="flex-shrink-0 w-full" :class="$style.inputContainer">
      <ChatInput
        :current-thread="currentThread"
        :threads="threads"
        :current-mode="currentMode"
        :current-phase="currentPhase"
        :modes="modes"
        :disabled="!hasRequiredApiKeys"
        @view-thread="(threadId: string) => actor.send({ type: 'VIEW_THREAD', threadId })"
        @open-thread-chat="(threadId: string) => actor.send({ type: 'OPEN_THREAD_CHAT', threadId })"
        @send-message="(text: string) => actor.send({ type: 'SEND_MESSAGE', text })"
        @new-thread="actor.send({ type: 'CLEAR_THREAD' })"
        @new-thread-as-child="(parentThreadId: string) => actor.send({ type: 'CREATE_CHILD_THREAD', parentThreadId })"
        @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
        @phase-change="(phase: string) => actor.send({ type: 'SET_PHASE', phase })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import { AlertCircle } from 'lucide-vue-next'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';
import type { AgentThreadData, MessageEntity, ThreadEntity } from '@app/api'

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const threads = useSelector(actor, (state) => (state.context.threads || []) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
const currentPhase = useSelector(actor, (state) => state.context.phase)
const modes = useSelector(actor, (state) => state.context.modes)
const hasRequiredApiKeys = useSelector(actor, (state) => state.context.hasRequiredApiKeys)
const messagesContainer = ref<HTMLElement | null>(null)

const navigateToSecrets = () => {
  actor.send({ type: 'NAVIGATE_TO_SECRETS' })
}

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