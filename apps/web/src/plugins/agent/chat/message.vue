<template>
  <div 
    :class="[
      'flex pb-3 animate-fade-in w-full',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div 
      :class="[
        'relative max-w-[75%] rounded-xl px-4 py-3 transition-all duration-200 group',
        isUser 
          ? 'bg-slate-700/90 text-slate-100 border border-slate-600/20 shadow-sm' 
          : 'bg-neutral-800/80 text-neutral-100 border border-neutral-700/30 shadow-sm',
        'hover:shadow-md'
      ]"
    >
      <!-- Floating hover UI -->
      <div 
        class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto"
      >
        <div class="flex items-center bg-neutral-800 rounded-lg border border-neutral-700 shadow-lg overflow-hidden">
          <!-- Timestamp -->
          <span class="text-xs text-neutral-400 px-3 py-1.5 border-r border-neutral-700">
            {{ formatTime(message.createdAt || new Date()) }}
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
import type { MessageEntity } from '@abuddy/api'

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

const formatTime = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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