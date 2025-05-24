<template>
  <div v-if="isMessagesOpen" class="p-3 pr-0 mt-2 overflow-hidden rounded-sm bg-neutral-900">
    <div class="overflow-y-auto max-h-96 messages-container">
      <ul class="mr-2 space-y-1">
        <li v-for="(message, index) in messages" :key="index" 
            :class="[
              'px-3 py-2 text-sm truncate rounded-sm',
              message.sender === 'user' ? 'bg-neutral-700/20 text-white border border-gray-700/30' : 'bg-neutral-900/40 text-white',
              // message.sender === 'user' ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-900 text-neutral-300'
            ]">
          {{ message.text }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Message {
  sender?: 'user' | 'assistant' | 'system'
  text?: string
}

defineProps<{
  isMessagesOpen: boolean
  messages: Message[]
}>()
</script>
