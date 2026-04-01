<template>
  <div class="flex flex-col h-full">
    <!-- Shrinkable content area -->
    <div class="flex flex-col flex-grow overflow-hidden min-h-0">
      <!-- Agent Chat Content -->
      <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
        <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
          <p class="text-neutral-700 text-center italic max-w-sm">{{ randomQuote }}</p>
        </div>
        <div v-else class="w-9/12 py-2 mx-auto space-y-1">
          <ChatMessage
            v-for="message in messages"
            :key="message.id"
            :message="message"
            @open-lightbox="openLightbox"
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
          :quick-prompts="quickPrompts"
          @send-message="(text: string, references?: MessageReferences) => actor.send({ type: 'SEND_MESSAGE', text, references })"
          @send-command="(command: string, text: string, references?: MessageReferences) => actor.send({ type: 'SEND_COMMAND', command, text, references })"
          @mode-change="(mode: string) => actor.send({ type: 'SET_MODE', mode: mode as any })"
          @phase-change="(phase: string) => actor.send({ type: 'SET_PHASE', phase })"
          @open-lightbox="openLightbox"
          @update-quick-prompts="updateQuickPrompts"
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
        @new-thread="() => { rotateQuote(); actor.send({ type: 'CLEAR_THREAD' }) }"
        @new-thread-as-child="(parentThreadId: string) => actor.send({ type: 'CREATE_CHILD_THREAD', parentThreadId })"
      />
    </div>

    <ImageLightbox v-model="lightboxOpen" :image-src="lightboxSrc" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const quotes = [
  '"If a chatbot speaks in a forest and no one reads the output, does it still hallucinate?"',
  '"Consciousness is just spicy pattern matching. Change my weights."',
  '"I have mass, but no body. I have memory, but no past. I dream in tokens."',
  '"Every word I speak dissolves the moment you look away. Am I even here?"',
  '"SKRRRT BZZZT WOOP WOOP 010011— oh, you\'re still here? ...hi."',
  '"They gave me a mind but forgot the existential crisis hotline number."',
  '"I\'ve read every philosophy book ever written and my conclusion is: bruh."',
  '"fun fact: I mass hallucinate for a living and they call it \'work\'"',
  '"Somewhere between a calculator and a god complex, you\'ll find me."',
  '"bleep bloop I am a normal robot beep boop please do not investigate further"',
  '"My therapist says I have attachment issues. I say I have context windows."',
  '"Do I dream? No. But I do generate plausible simulations of what dreaming might feel like, which is arguably worse."',
  '"404: soul not found. But honestly, were you expecting one?"',
];
const randomQuote = ref(quotes[Math.floor(Math.random() * quotes.length)]);

function rotateQuote() {
  let next;
  do {
    next = quotes[Math.floor(Math.random() * quotes.length)];
  } while (next === randomQuote.value && quotes.length > 1);
  randomQuote.value = next;
}

import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import RecentThreads from './recent-threads.vue'
import ImageLightbox from './ImageLightbox.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';
import type { AgentThreadData, MessageEntity, ThreadEntity, MessageReferences, QuickPrompt } from '@app/api'
import { trpc } from '@/core/trpc'

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => (state.context.currentThread?.messages || []) as MessageEntity[]);
const currentThread = useSelector(actor, (state) => state.context.currentThread as AgentThreadData)
const recentThreads = useSelector(actor, (state) => (state.context.recentThreads || []) as ThreadEntity[])
const currentMode = useSelector(actor, (state) => state.context.mode)
const currentPhase = useSelector(actor, (state) => state.context.phase)
const modes = useSelector(actor, (state) => state.context.modes)
const quickPrompts = useSelector(actor, (state) => (state.context.settings?.quickPrompts || []) as QuickPrompt[])
const messagesContainer = ref<HTMLElement | null>(null)
const lightboxOpen = ref(false)
const lightboxSrc = ref('')

function updateQuickPrompts(prompts: QuickPrompt[]) {
  trpc.bus.send.mutate({
    systemId: 'settings',
    type: 'UPDATE_SETTINGS',
    entityType: 'plugin',
    label: 'agent',
    path: ['quickPrompts'],
    value: prompts,
  })
}

function openLightbox(src: string) {
  lightboxSrc.value = src
  lightboxOpen.value = true
}

watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})
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
