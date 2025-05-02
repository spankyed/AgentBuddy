<template>
  <div 
    :class="[
      'flex pb-6 pt-2 animate-fade-in',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div 
      :class="[
        'max-w-[80%] rounded-xl  px-4 py-3',
        isUser ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-white'
      ]"
    >
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
import type { Message } from '../types'

interface ChatMessageProps {
  message: Message
}

const props = defineProps<ChatMessageProps>()

const isUser = computed(() => props.message.role === 'user')
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 