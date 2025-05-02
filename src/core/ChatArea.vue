<template>
  <div
    class="pt-3 flex flex-col border-t bg-neutral-900 border-neutral-800"
    :class="$style.component"
  >
    <div class="flex-grow w-full overflow-y-auto" :class="$style.messagesContainer" ref="messagesContainer">
      <div class="max-w-[80%] mx-auto space-y-2">
        <ChatMessage 
          v-for="message in messages" 
          :key="message.id" 
          :message="message" 
        />
      </div>
    </div>
    <ChatInput @send-message="$emit('send-message', $event)" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import type { Message } from './types'

interface ChatAreaProps {
  messages: Message[]
}

const props = defineProps<ChatAreaProps>()
defineEmits<(e: 'send-message', message: string) => void>()

const messagesContainer = ref<HTMLElement | null>(null)

watch(() => props.messages.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})
</script>

<style lang="scss" module>
.component {
  height: 38rem;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -0.5rem 1rem -0.125rem rgba(0, 0, 0, 0.1), 0 -0.25rem 0.5rem -0.0625rem rgba(0, 0, 0, 0.05);
}

.messagesContainer {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scroll-behavior: smooth;
}
/* Add any component-specific styles here */
</style> 