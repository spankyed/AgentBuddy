<template>
  <UnifiedMonacoEditor
    v-bind="$props"
    v-on="$attrs"
    mode="simple"
    :preset="resolvedPreset"
    @update:modelValue="handleUpdate"
    @execute="handleExecute"
    @change="handleChange"
    @cursorChange="handleCursorChange"
    @mount="handleMount"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import UnifiedMonacoEditor from './UnifiedMonacoEditor.vue'
import type { editor } from 'monaco-editor'

export interface SimpleMonacoEditorProps {
  modelValue: string
  language?: string
  readOnly?: boolean
  minimal?: boolean
  theme?: string
  height?: string
  options?: editor.IStandaloneEditorConstructionOptions
  executeKey?: boolean
  placeholder?: string
  functionBody?: boolean
  dslType?: 'database' | 'action' | 'prompt'
}

const props = withDefaults(defineProps<SimpleMonacoEditorProps>(), {
  language: 'javascript',
  readOnly: false,
  minimal: false,
  theme: 'vs-dark',
  executeKey: false,
  functionBody: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'execute': []
  'change': [value: string]
  'cursorChange': [position: { line: number; col: number }]
  'mount': [editor: editor.IStandaloneCodeEditor]
}>()

// Compute the preset based on props
const resolvedPreset = computed(() => {
  if (props.readOnly) return 'readonly'
  if (props.minimal) return 'minimal'
  if (props.functionBody || props.dslType) return 'dsl'
  return 'default'
})

// Pass through event handlers
const handleUpdate = (value: string) => {
  emit('update:modelValue', value)
}

const handleExecute = () => {
  emit('execute')
}

const handleChange = (value: string) => {
  emit('change', value)
}

const handleCursorChange = (position: { line: number; col: number }) => {
  emit('cursorChange', position)
}

const handleMount = (editor: editor.IStandaloneCodeEditor) => {
  emit('mount', editor)
}
</script>