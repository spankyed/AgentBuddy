<template>
  <div class="border rounded-md border-neutral-700">
    <textarea
      ref="textareaRef"
      :value="content.text"
      @input="updateContent(($event.target as HTMLTextAreaElement).value)"
      placeholder="Enter text content..."
      class="w-full px-4 py-3 text-sm transition-colors resize-none bg-neutral-800 text-neutral-100 focus:outline-none"
      :style="{ minHeight: '200px', height: textareaHeight }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { TextBlockContent } from '@app/api'

const props = defineProps<{
  content: TextBlockContent
}>()

const emit = defineEmits<{
  update: [content: string]
}>()

const textareaRef = ref<HTMLTextAreaElement>()
const textareaHeight = ref('auto')

const updateContent = async (value: string) => {
  emit('update', value)
  await nextTick()
  adjustTextareaHeight()
}

const adjustTextareaHeight = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`
    textareaHeight.value = `${textareaRef.value.scrollHeight}px`
  }
}

watch(() => props.content.text, async () => {
  await nextTick()
  adjustTextareaHeight()
}, { immediate: true })
</script>