<template>
  <div
    class="flex flex-col bg-neutral-900 border-t border-neutral-700"
    :class="$style.component"
  >
    <div class="flex-grow overflow-y-auto">
      <div class="divide-y divide-neutral-100">
        <ChatMessage 
          v-for="message in messages" 
          :key="message.id" 
          :message="message" 
        />
        <div ref="messagesEndRef" />
      </div>
    </div>
    <ChatInput @send-message="$emit('send-message', $event)" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import type { Message } from './types'

interface ChatAreaProps {
  messages: Message[]
}

const props = defineProps<ChatAreaProps>()
defineEmits<(e: 'send-message', message: string) => void>()

const messagesEndRef = ref<HTMLDivElement | null>(null)

watch(() => props.messages, () => {
  messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
}, { deep: true })
</script>

<style lang="scss" module>
.component {
  height: 28rem;
}
/* Add any component-specific styles here */
</style> 