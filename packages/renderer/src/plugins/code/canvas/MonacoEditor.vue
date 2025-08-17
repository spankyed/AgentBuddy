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
    preset="auto"
    preserveViewState
    @update:modelValue="handleUpdate"
    @change="handleChange"
    @mount="handleMount"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UnifiedMonacoEditor from '@/core/components/UnifiedMonacoEditor.vue'
import type { editor } from 'monaco-editor'
import { registerInsertConsoleLogAction } from '@/plugins/code/actions/insert-console-log'

const props = defineProps<{
  modelValue: string
  filePath?: string
  language?: string
  readOnly?: boolean
  theme?: string
  diffMode?: boolean
  originalContent?: string
  modifiedContent?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'mount': [editor: editor.IStandaloneCodeEditor]
}>()

const unifiedEditorRef = ref<InstanceType<typeof UnifiedMonacoEditor>>()

const handleUpdate = (value: string) => {
  emit('update:modelValue', value)
}

const handleChange = (value: string) => {
  emit('change', value)
}

const handleMount = (editor: editor.IStandaloneCodeEditor) => {
  const monaco = (window as any).monaco
  if (monaco) {
    // Register custom actions specific to code plugin
    registerInsertConsoleLogAction(editor, monaco)
  }
  emit('mount', editor)
}

// Expose methods for external use
defineExpose({
  getEditor: () => unifiedEditorRef.value?.getEditor(),
  switchToFile: (filePath: string, content: string) => unifiedEditorRef.value?.switchToFile(filePath, content),
  getValue: () => unifiedEditorRef.value?.getValue(),
  setValue: (value: string) => unifiedEditorRef.value?.setValue(value)
})
</script>