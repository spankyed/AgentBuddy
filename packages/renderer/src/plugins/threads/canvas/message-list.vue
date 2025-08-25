<template>
  <div v-if="isMessagesOpen" class="p-4 pr-2 mt-2 overflow-hidden rounded-sm bg-neutral-900">
    <div class="overflow-y-auto max-h-96 messages-container">
      <ul class="mr-2 space-y-1">
        <li v-for="(message, index) in messages" 
            :key="index" 
            @click="toggleMessage(index)"
            :class="[
              'group relative px-3 py-2 text-sm rounded-sm cursor-pointer',
              isUserMsg(message) ? 'bg-neutral-700/20 text-white border border-gray-700/30' : 'bg-neutral-900/40 text-white',
            ]">
          <span :class="{ 'block truncate pr-16': expandedMessageIndex !== index, 'whitespace-pre-wrap': expandedMessageIndex === index }">
            {{ message.text }}
          </span>
          <!-- Show more indicator -->
          <span 
            v-if="expandedMessageIndex !== index && isLongMessage(message.text)"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400"
          >
            <span class="group-hover:hidden">see more</span>
            <ChevronDown class="hidden w-4 h-4 group-hover:block" />
          </span>
          <!-- Show less indicator for expanded messages -->
          <span 
            v-if="expandedMessageIndex === index && isLongMessage(message.text)"
            class="absolute right-3 top-2 text-xs text-neutral-400"
          >
            <ChevronUp class="w-4 h-4" />
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

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

const isLongMessage = (text?: string) => {
  // Check if message is long enough to be truncated (approximately > 100 chars)
  return text ? text.length > 100 : false
}
</script>
