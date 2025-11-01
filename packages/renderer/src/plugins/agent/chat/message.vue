<template>
  <div
    :class="[
      'flex pb-3 animate-fade-in w-full',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div
      :class="[
        'relative rounded-xl px-4 py-3 transition-all duration-200 group',
        isUser
          ? 'bg-neutral-800/80 text-neutral-100 border border-neutral-700/30'
          : ' text-neutral-100 border border-neutral-700/80',
        'hover:shadow-md'
      ]"
    >
      <!-- Floating hover UI -->
      <div
        class="absolute transition-opacity duration-200 opacity-0 pointer-events-none -bottom-3 -right-4 group-hover:opacity-100 group-hover:pointer-events-auto"
      >
        <div class="flex items-center overflow-hidden border rounded-lg shadow-lg bg-neutral-800 border-neutral-700">
          <!-- Timestamp -->
          <span v-if="message.createdAt" class="text-xs text-neutral-400 px-3 py-1.5 border-r border-neutral-700 whitespace-nowrap">
            {{ formatTime(new Date(message.createdAt)) }}
          </span>

          <!-- Action buttons -->
          <button
            v-if="isUser"
            @click="$emit('revert', message.id)"
            class="p-1.5 hover:bg-neutral-700 transition-colors"
            title="Revert to this message"
          >
            <svg class="w-4 h-4 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          <button
            @click="$emit('fork', message.id)"
            class="p-1.5 hover:bg-neutral-700 transition-colors"
            title="Fork conversation"
          >
            <svg class="w-4 h-4 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>

          <button
            @click="copyMessageText"
            class="p-1.5 hover:bg-neutral-700 transition-colors"
            title="Copy message text"
          >
            <svg class="w-4 h-4 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Message content -->
      <div class="leading-relaxed text-[15px]">
        <p
          v-for="(paragraph, index) in message.text.split('\n')"
          :key="index"
          :class="{ 'mt-2.5': index > 0 }"
        >
          {{ paragraph }}
        </p>
      </div>

      <!-- Block-based interactions -->
      <InteractionContainer
        v-if="message.blocks && message.blocks.length > 0"
        :blocks="message.blocks"
        :message-id="message.id"
        :is-disabled="!!message.responseTimestamp"
        :response="message.blockResponse"
      />

      <!-- Typing indicator for AI messages -->
      <div
        v-if="!isUser && isTyping"
        class="flex gap-1.5 mt-2.5"
      >
        <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse"></span>
        <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse" style="animation-delay: 200ms"></span>
        <span class="w-1.5 h-1.5 bg-neutral-500 rounded-full animate-pulse" style="animation-delay: 400ms"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MessageEntity } from '@app/api'
import InteractionContainer from './interactions/InteractionContainer.vue'

interface ChatMessageProps {
  message: MessageEntity
  isTyping?: boolean
}

interface ChatMessageEmits {
  (e: 'revert', messageId: string): void
  (e: 'fork', messageId: string): void
}

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isTyping: false
})

const emit = defineEmits<ChatMessageEmits>()

const isUser = computed(() => props.message.sender === 'user')

const copyMessageText = async () => {
  try {
    await navigator.clipboard.writeText(props.message.text)
  } catch (error) {
    console.error('Failed to copy text:', error)
  }
}

const formatTime = (date: Date | string | null | undefined) => {
  if (!date) return ''

  try {
    const d = typeof date === 'string' ? new Date(date) : date
    // Check if d is a valid Date object
    if (!(d instanceof Date) || isNaN(d.getTime())) {
      return ''
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    console.error('Error formatting time:', error, date)
    return ''
  }
}
</script>

<style lang="scss" scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}

.animate-bounce {
  animation: bounce 1.4s ease-in-out infinite;
}
</style>
