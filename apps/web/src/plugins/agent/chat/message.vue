<template>
  <div 
    :class="[
      'flex pb-3 animate-fade-in w-full',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div 
      :class="[
        'relative max-w-[75%] rounded-xl px-4 py-3 transition-all duration-200',
        isUser 
          ? 'bg-slate-700/90 text-slate-100 border border-slate-600/20 shadow-sm' 
          : 'bg-neutral-800/80 text-neutral-100 border border-neutral-700/30 shadow-sm',
        'hover:shadow-md'
      ]"
    >
        
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

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isTyping: false
})

const isUser = computed(() => props.message.sender === 'user')
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