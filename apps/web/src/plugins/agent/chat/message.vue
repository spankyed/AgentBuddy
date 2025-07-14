<template>
  <div 
    :class="[
      'flex pb-4 pt-2 animate-fade-in w-full group',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div class="flex gap-3 max-w-[85%]" :class="isUser ? 'flex-row-reverse' : 'flex-row'">
      <!-- Avatar -->
      <div 
        :class="[
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-200',
          isUser 
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20' 
            : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
        ]"
      >
        {{ isUser ? 'U' : 'AI' }}
      </div>
      
      <!-- Message bubble -->
      <div 
        :class="[
          'relative rounded-2xl px-4 py-3 transition-all duration-200',
          isUser 
            ? 'bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 hover:border-blue-500/30' 
            : 'bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 border border-neutral-700/50 hover:border-neutral-600/50',
          'backdrop-blur-sm shadow-lg',
          isUser ? 'shadow-blue-500/10' : 'shadow-neutral-900/20'
        ]"
      >
        <!-- Message timestamp (appears on hover) -->
        <div 
          :class="[
            'absolute -top-6 text-xs text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            isUser ? 'right-0' : 'left-0'
          ]"
        >
          {{ new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
        </div>
        
        <!-- Message content -->
        <div class="leading-relaxed text-sm md:text-base">
          <p 
            v-for="(paragraph, index) in message.text.split('\n')"
            :key="index"
            :class="[
              'text-neutral-100',
              { 'mt-3': index > 0 }
            ]"
          >
            {{ paragraph }}
          </p>
        </div>
        
        <!-- Typing indicator for AI messages -->
        <div 
          v-if="!isUser && isTyping" 
          class="flex gap-1 mt-2"
        >
          <span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
        </div>
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