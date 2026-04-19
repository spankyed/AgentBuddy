<template>
  <div v-if="isMessagesOpen" class="pb-4 pr-2overflow-hidden rounded-sm bg-neutral-900">
    <div class="overflow-y-auto max-h-96 messages-container">
      <ul class="mr-2 space-y-1">
        <li v-for="(message, index) in messages"
            :key="index"
            @click="toggleMessage(index)"
            :class="[
              'group relative px-3 py-2 text-sm rounded-sm cursor-pointer',
              isUserMsg(message) ? 'bg-neutral-700/20 text-white border border-gray-700/30' : 'bg-neutral-900/40 text-white',
              expandedMessageIndex !== index ? 'flex items-center overflow-hidden' : '',
            ]">
          <span :class="{ 'msg-collapsed min-w-0': expandedMessageIndex !== index, 'whitespace-pre-wrap': expandedMessageIndex === index }">
            <TiptapEditor mode="viewer" :model-value="message.text ?? ''" />
          </span>
          <!-- Show more indicator -->
          <span
            v-if="expandedMessageIndex !== index && isLongMessage(message.text)"
            class="ml-auto pl-1 text-neutral-400 shrink-0"
          >
            <ChevronDown class="w-4 h-4" />
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

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

<style scoped>
.msg-collapsed {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-collapsed :deep(*) {
  display: inline;
  white-space: nowrap;
}
</style>
