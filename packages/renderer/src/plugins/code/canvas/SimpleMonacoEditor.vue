<template>
  <div ref="editorContainer" class="w-full h-full monaco-editor-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { initializeMonaco, createEditor, createDiffEditor, getLanguageId } from '@/plugins/code/utils/simple-monaco-config'

// Props
const props = defineProps<{
  modelValue: string
  filePath?: string
  language?: string
  readOnly?: boolean
  theme?: string
  // Diff mode props
  diffMode?: boolean
  originalContent?: string
  modifiedContent?: string
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

// Refs
const editorContainer = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor | null = null
let isUpdatingModel = false

// Helper functions
const isDiffEditor = (editor: any): editor is monaco.editor.IStandaloneDiffEditor => {
  return props.diffMode && 'getOriginalEditor' in editor
}

const getStandaloneEditor = (): monaco.editor.IStandaloneCodeEditor | null => {
  if (!editor) return null
  return isDiffEditor(editor) ? editor.getModifiedEditor() : editor as monaco.editor.IStandaloneCodeEditor
}

const resolveLanguage = (): string => {
  return props.language || (props.filePath ? getLanguageId(props.filePath) : 'typescript')
}

const setupChangeListener = (targetEditor: monaco.editor.IStandaloneCodeEditor) => {
  targetEditor.onDidChangeModelContent(() => {
    if (!isUpdatingModel) {
      const value = targetEditor.getValue()
      emit('update:modelValue', value)
      emit('change', value)
    }
  })
}

// Lifecycle
onMounted(async () => {
  if (!editorContainer.value) return
  
  await initializeMonaco()
  
  const language = resolveLanguage()
  const editorOptions = {
    readOnly: props.readOnly,
    theme: props.theme,
  }
  
  if (props.diffMode && props.originalContent !== undefined && props.modifiedContent !== undefined) {
    editor = createDiffEditor(
      editorContainer.value,
      props.originalContent,
      props.modifiedContent,
      language,
      editorOptions
    )
    setupChangeListener(editor.getModifiedEditor())
  } else {
    editor = createEditor(
      editorContainer.value,
      props.modelValue,
      language,
      editorOptions
    )
    setupChangeListener(editor)
  }
})

onUnmounted(() => {
  editor?.dispose()
})

// Watch for external value changes
watch(() => props.modelValue, (newValue) => {
  const standaloneEditor = getStandaloneEditor()
  if (!standaloneEditor || props.diffMode) return
  
  if (standaloneEditor.getValue() !== newValue) {
    isUpdatingModel = true
    standaloneEditor.setValue(newValue)
    isUpdatingModel = false
  }
})

// Watch for diff content changes
watch(() => [props.originalContent, props.modifiedContent], ([newOriginal, newModified]) => {
  if (!editor || !isDiffEditor(editor)) return
  
  const originalModel = editor.getOriginalEditor().getModel()
  const modifiedModel = editor.getModifiedEditor().getModel()
  
  if (originalModel && newOriginal !== undefined && originalModel.getValue() !== newOriginal) {
    originalModel.setValue(newOriginal)
  }
  
  if (modifiedModel && newModified !== undefined && modifiedModel.getValue() !== newModified) {
    isUpdatingModel = true
    modifiedModel.setValue(newModified)
    isUpdatingModel = false
  }
})

// Watch for language changes
watch(() => props.filePath, (newPath) => {
  if (!editor || !newPath) return
  
  const newLanguage = getLanguageId(newPath)
  
  if (isDiffEditor(editor)) {
    const originalModel = editor.getOriginalEditor().getModel()
    const modifiedModel = editor.getModifiedEditor().getModel()
    
    if (originalModel) {
      monaco.editor.setModelLanguage(originalModel, newLanguage)
    }
    if (modifiedModel) {
      monaco.editor.setModelLanguage(modifiedModel, newLanguage)
    }
  } else {
    const model = editor.getModel()
    if (model) {
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
  if (!editor) return
  
  if (isDiffEditor(editor)) {
    editor.updateOptions({ 
      originalEditable: false,
      readOnly: newReadOnly 
    })
  } else {
    editor.updateOptions({ readOnly: newReadOnly })
  }
})
</script>

<style scoped>
.monaco-editor-container {
  min-height: 200px;
}
</style>