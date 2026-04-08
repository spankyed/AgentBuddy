<template>
  <UnifiedMonacoEditor
    ref="unifiedEditorRef"
    :modelValue="modelValue"
    :filePath="filePath"
    :language="language"
    :readOnly="readOnly"
    :theme="theme || 'vs-dark'"
    :mode="diffMode ? 'diff' : 'multi-file'"
    :diffOriginal="originalContent"
    :diffModified="modifiedContent"
    :actions="['insertConsoleLog']"
    :dslParams="dslParams"
    preset="auto"
    preserveViewState
    @update:modelValue="$emit('update:modelValue', $event)"
    @change="$emit('change', $event)"
    @mount="$emit('mount', $event)"
    @fileReady="$emit('fileReady')"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UnifiedMonacoEditor from '@/core/components/UnifiedMonacoEditor.vue'
import type { editor } from 'monaco-editor'

const props = defineProps<{
  modelValue: string
  filePath?: string
  language?: string
  readOnly?: boolean
  theme?: string
  diffMode?: boolean
  originalContent?: string
  modifiedContent?: string
  dslParams?: Record<string, { type: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'mount': [editor: editor.IStandaloneCodeEditor]
  'fileReady': []
}>()

const unifiedEditorRef = ref<InstanceType<typeof UnifiedMonacoEditor>>()

// Expose methods for external use
defineExpose({
  getEditor: () => unifiedEditorRef.value?.getEditor(),
  switchToFile: (filePath: string, content: string) => unifiedEditorRef.value?.switchToFile(filePath, content),
  getValue: () => unifiedEditorRef.value?.getValue(),
  setValue: (value: string) => unifiedEditorRef.value?.setValue(value)
})
</script>