<template>
  <div v-if="isMessagesOpen" class="p-4 pr-2 mt-2 overflow-hidden rounded-sm bg-neutral-900">
    <div class="overflow-y-auto max-h-96 messages-container">
      <ul class="mr-2 space-y-1">
        <li v-for="(message, index) in messages" 
            :key="index" 
            @click="toggleMessage(index)"
            :class="[
              'px-3 py-2 text-sm rounded-sm cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:brightness-110',
              { 'truncate': expandedMessageIndex !== index },
              isUserMsg(message) ? 'bg-neutral-700/20 text-white border border-gray-700/30' : 'bg-neutral-900/40 text-white',
            ]">
          {{ message.text }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Message {
  sender?: 'user' | 'assistant' | 'system'
  text?: string
}
const isUserMsg = (message: Message) => message.sender === 'user'

defineProps<{
  isMessagesOpen: boolean
  messages: Message[]
}>()

const expandedMessageIndex = ref<number | null>(null)

const toggleMessage = (index: number) => {
  expandedMessageIndex.value = expandedMessageIndex.value === index ? null : index
}
</script>
