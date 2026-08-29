<template>
  <div>
    <textarea
      ref="textareaRef"
      :value="content.text"
      placeholder="Plain text content..."
      class="w-full min-h-[12rem] bg-transparent text-neutral-200 resize-none outline-none"
      @input="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import type { TextContent } from '@app/api'

defineProps<{
  content: TextContent
}>()

const emit = defineEmits<{
  update: [content: string]
}>()

const textareaRef = ref<HTMLTextAreaElement>()

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update', value)
  nextTick(autoResize)
}

onMounted(autoResize)
</script>
