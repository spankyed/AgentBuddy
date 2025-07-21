<template>
  <div ref="editorContainer" class="monaco-editor-container h-full w-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { initializeMonaco, createEditor, getLanguageId, loadProjectFiles } from '../utils/simple-monaco-config'
import { trpc } from '@/core/trpc'

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

// Load project files once
let projectFilesLoaded = false

async function loadProjectFilesOnce() {
  if (projectFilesLoaded) return
  
  try {
    // Subscribe to receive project files
    const subscription = trpc.bus.sub.subscribe(undefined, {
      onData(event) {
        if (event.type === 'PROJECT_TEXT_FILES') {
          loadProjectFiles(event.data.files)
          projectFilesLoaded = true
          subscription.unsubscribe()
        }
      }
    })
    
    // Request project files
    await trpc.bus.send.mutate({
      systemId: 'code' as any,
      type: 'GET_PROJECT_TEXT_FILES' as any
    } as any)
  } catch (error) {
    console.warn('Failed to load project files:', error)
  }
}

// Lifecycle
onMounted(async () => {
  if (!editorContainer.value) return
  
  // Initialize Monaco
  await initializeMonaco()
  
  // Load project files for IntelliSense
  loadProjectFilesOnce()
  
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