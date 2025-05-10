<template>
  <div 
    :class="[
      'flex pb-6 pt-2 animate-fade-in w-full',
      isUser ? 'justify-end' : 'justify-start'
    ]"
  >
    <div 
      :class="[
        'max-w-[80%] rounded-md  px-4 py-3',
        isUser ? 'bg-neutral-800 text-white' : 'bg-neutral-900/40 text-white'
      ]"
    >
      <div class="leading-relaxed whitespace-pre-line text-md">
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
import type { Message } from '@/plugins/agent/types'

interface ChatMessageProps {
  message: Message
}

const props = defineProps<ChatMessageProps>()

const isUser = computed(() => props.message.role === 'user')
</script>

<style lang="scss" module>
/* Add any component-specific styles here */
</style> 