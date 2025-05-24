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
        isUser ? 'bg-neutral-700/20 text-white border border-gray-700/30' : 'max-w-[90%] bg-neutral-900/40 text-white'
      ]"
    >
      <div class="leading-relaxed whitespace-pre-line text-md">
        <p 
          v-for="(paragraph, index) in message.text.split('\n')"
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
import type { MessageEntity } from '@abuddy/api'

interface ChatMessageProps {
  message: MessageEntity
}

const props = defineProps<ChatMessageProps>()

const isUser = computed(() => props.message.sender === 'user')
</script>

<style lang="scss" module>
/* Add any component-specific styles here */
</style> 