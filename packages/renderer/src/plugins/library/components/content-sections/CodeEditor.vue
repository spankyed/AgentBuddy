<template>
  <div
    ref="containerRef"
    class="overflow-hidden"
    :style="{ height: containerHeight + 'px' }"
  >
    <UnifiedMonacoEditor
      :model-value="content.text"
      :language="resolvedLanguage"
      preset="codeEditor"
      @update:model-value="emit('update', $event)"
      @mount="handleMount"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { editor, IDisposable } from 'monaco-editor'
import UnifiedMonacoEditor from '@/core/components/UnifiedMonacoEditor.vue'
import { getLanguageFromPath } from '@/core/utils/monaco-config'
import type { CodeContent } from '@app/api'

const MIN_HEIGHT = 320 // 20rem

const props = defineProps<{
  content: CodeContent
  fileName?: string
}>()

const emit = defineEmits<{
  update: [content: string]
}>()

const containerRef = ref<HTMLDivElement>()
const containerHeight = ref(MIN_HEIGHT)
let sizeChangeDisposable: IDisposable | null = null

const resolvedLanguage = computed(() => {
  if (props.fileName) return getLanguageFromPath(props.fileName)
  return props.content.language || 'plaintext'
})

const handleMount = (editorInstance: editor.IStandaloneCodeEditor) => {
  const updateHeight = () => {
    const contentHeight = editorInstance.getContentHeight()
    containerHeight.value = Math.max(MIN_HEIGHT, contentHeight)
  }

  sizeChangeDisposable = editorInstance.onDidContentSizeChange(updateHeight)
  updateHeight()
}

onBeforeUnmount(() => {
  sizeChangeDisposable?.dispose()
  sizeChangeDisposable = null
})
</script>
