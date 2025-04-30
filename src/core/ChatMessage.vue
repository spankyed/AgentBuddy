<template>
  <div 
    :class="[
      'flex gap-3 p-4 animate-fade-in',
      isUser ? 'bg-neutral-800' : 'bg-neutral-800'
    ]"
  >
    <div class="flex-shrink-0">
      <div 
        :class="[
          'w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary-500' : 'bg-accent-400'
        ]"
      >
        <component 
          :is="isUser ? User : Bot" 
          :size="16" 
          class="text-white" 
        />
      </div>
    </div>
    <div class="flex-grow">
      <div class="flex items-center mb-1">
        <span class="text-sm font-medium">
          {{ isUser ? 'You' : 'AI Assistant' }}
        </span>
        <span class="ml-2 text-xs text-neutral-500">
          {{ formatTime(message.timestamp) }}
        </span>
      </div>
      <div class="text-sm leading-relaxed whitespace-pre-line">
        <p 
          v-for="(paragraph, index) in message.content.split('\n')"
          :key="index"
          :class="{ 'mt-2': index > 0 }"
        >
          {{ paragraph }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { User, Bot } from 'lucide-vue-next'
import type { Message } from './types'

interface ChatMessageProps {
  message: Message
}

const props = defineProps<ChatMessageProps>()

const isUser = computed(() => props.message.role === 'user')

const formatTime = (timestamp: Date) => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 