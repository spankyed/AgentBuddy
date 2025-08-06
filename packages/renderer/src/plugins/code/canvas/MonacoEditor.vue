<template>
  <div class="w-full h-full monaco-editor-container">
    <VueMonacoDiffEditor
      v-if="diffMode"
      :theme="theme || 'vs-dark'"
      :original="originalContent || ''"
      :modified="modifiedContent || modelValue"
      :language="resolvedLanguage"
      :options="diffEditorOptions"
      @mount="handleDiffMount"
      class="h-full"
    />
    <VueMonacoEditor
      v-else
      :theme="theme || 'vs-dark'"
      :options="editorOptions"
      @mount="handleMount"
      class="h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef, onBeforeUnmount } from 'vue'
import { VueMonacoEditor, VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import { getLanguageId, initializeMonaco } from '@/plugins/code/utils/simple-monaco-config'

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

// Editor instances
const editor = shallowRef<any>()
const diffEditor = shallowRef<any>()

// Model and view state management
const models = new Map<string, any>()
const viewStates = new Map<string, any>()
const currentModelPath = ref<string | undefined>()

// Computed language
const resolvedLanguage = computed(() => {
  return props.language || (props.filePath ? getLanguageId(props.filePath) : 'typescript')
})

// Common editor options
const commonOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  folding: true,
  bracketPairColorization: { enabled: true },
  formatOnPaste: true,
  formatOnType: true,
  // Disable most IntelliSense features
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnCommitCharacter: false,
  acceptSuggestionOnEnter: 'off' as const,
  snippetSuggestions: 'none' as const,
  wordBasedSuggestions: 'currentDocument' as const,
}

// Editor options
const editorOptions = computed(() => ({
  ...commonOptions,
  readOnly: props.readOnly,
}))

// Diff editor options
const diffEditorOptions = computed(() => ({
  ...commonOptions,
  readOnly: props.readOnly,
  renderSideBySide: true,
  enableSplitViewResizing: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  originalEditable: false,
}))

// Get or create model for a file
const getOrCreateModel = (filePath: string, content: string, language: string) => {
  const monaco = (window as any).monaco
  if (!monaco) return null
  
  let model = models.get(filePath)
  if (!model) {
    // Create a new model for this file
    const uri = monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/')}`)
    model = monaco.editor.createModel(content, language, uri)
    models.set(filePath, model)
    
    // Listen for content changes on the model
    model.onDidChangeContent(() => {
      if (currentModelPath.value === filePath) {
        const value = model.getValue()
        emit('update:modelValue', value)
        emit('change', value)
      }
    })
  } else {
    // Update existing model content if it's different
    if (model.getValue() !== content) {
      model.setValue(content)
    }
  }
  
  return model
}

// Switch to a different file/model
const switchToFile = (filePath: string, content: string, language: string) => {
  if (!editor.value || props.diffMode) return
  
  // Save current view state before switching
  if (currentModelPath.value) {
    const viewState = editor.value.saveViewState()
    if (viewState) {
      viewStates.set(currentModelPath.value, viewState)
    }
  }
  
  // Get or create the model for the new file
  const model = getOrCreateModel(filePath, content, language)
  if (!model) return
  
  // Set the new model
  editor.value.setModel(model)
  currentModelPath.value = filePath
  
  // Restore view state if available
  const savedViewState = viewStates.get(filePath)
  if (savedViewState) {
    editor.value.restoreViewState(savedViewState)
  }
}

// Handle editor mount
const handleMount = (editorInstance: any) => {
  editor.value = editorInstance
  initializeMonaco()
  
  // Initialize with the first file if provided
  if (props.filePath && props.modelValue) {
    switchToFile(props.filePath, props.modelValue, resolvedLanguage.value)
  }
}

// Handle diff editor mount
const handleDiffMount = (diffEditorInstance: any) => {
  diffEditor.value = diffEditorInstance
  initializeMonaco()
  
  // Set up change listener for modified editor in diff mode
  const modifiedEditor = diffEditorInstance.getModifiedEditor()
  modifiedEditor.onDidChangeModelContent(() => {
    if (!props.readOnly) {
      const value = modifiedEditor.getValue()
      emit('update:modelValue', value)
      emit('change', value)
    }
  })
}

// Watch for file/content changes
watch(
  () => [props.filePath, props.modelValue, props.language],
  ([newPath, newContent, newLang]) => {
    if (!props.diffMode && newPath && newContent !== undefined && editor.value) {
      // Switch to the new file
      switchToFile(newPath as string, newContent as string, newLang as string || resolvedLanguage.value)
    } else if (!props.diffMode && currentModelPath.value && models.has(currentModelPath.value)) {
      // Update current model content if no path change
      const model = models.get(currentModelPath.value)
      if (model && model.getValue() !== newContent) {
        model.setValue(newContent as string)
      }
    }
  }
)

// Watch for diff content changes
watch(() => [props.originalContent, props.modifiedContent], () => {
  // VueMonacoDiffEditor handles prop changes automatically
})

// Cleanup on unmount
onBeforeUnmount(() => {
  // Save current view state
  if (editor.value && currentModelPath.value) {
    const viewState = editor.value.saveViewState()
    if (viewState) {
      viewStates.set(currentModelPath.value, viewState)
    }
  }
  
  // Dispose all models
  models.forEach((model) => {
    model.dispose()
  })
  models.clear()
  viewStates.clear()
})
</script>

<style scoped>
.monaco-editor-container {
  min-height: 200px;
}
</style>