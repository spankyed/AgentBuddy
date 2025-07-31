<template>
  <div ref="editorContainer" class="w-full h-full monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { initializeMonaco, createEditor, getLanguageId } from '@/plugins/code/utils/simple-monaco-config'

// Props
const props = defineProps<{
  modelValue: string
  filePath?: string
  language?: string
  readOnly?: boolean
  theme?: string
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

// Refs
const editorContainer = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let isUpdatingModel = false

// Removed project file loading - keeping Monaco simple

// Lifecycle
onMounted(async () => {
  if (!editorContainer.value) return
  
  // Initialize Monaco
  await initializeMonaco()
  
  // Determine language
  const language = props.language || (props.filePath ? getLanguageId(props.filePath) : 'typescript')
  
  // Create editor
  editor = createEditor(
    editorContainer.value,
    props.modelValue,
    language,
    {
      readOnly: props.readOnly,
      theme: props.theme,
    }
  )
  
  // Set up change listener
  editor.onDidChangeModelContent(() => {
    if (!isUpdatingModel && editor) {
      const value = editor.getValue()
      emit('update:modelValue', value)
      emit('change', value)
    }
  })
})

onUnmounted(() => {
  editor?.dispose()
})

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  if (editor && editor.getValue() !== newValue) {
    isUpdatingModel = true
    editor.setValue(newValue)
    isUpdatingModel = false
  }
})

// Watch for language changes
watch(() => props.filePath, (newPath) => {
  if (editor && newPath) {
    const model = editor.getModel()
    if (model) {
      const newLanguage = getLanguageId(newPath)
      monaco.editor.setModelLanguage(model, newLanguage)
    }
  }
})

// Watch for theme changes
watch(() => props.theme, (newTheme) => {
  if (newTheme) {
    monaco.editor.setTheme(newTheme)
  }
})

// Watch for readonly changes
watch(() => props.readOnly, (newReadOnly) => {
  editor?.updateOptions({ readOnly: newReadOnly })
})
</script>

<style scoped>
.monaco-editor-container {
  min-height: 200px;
}
</style>