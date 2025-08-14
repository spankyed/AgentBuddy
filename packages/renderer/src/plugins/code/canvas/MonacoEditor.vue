<template>
  <div class="w-full h-full monaco-editor-container relative">
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
import { computed, watch, shallowRef, onBeforeUnmount } from 'vue'
import { VueMonacoEditor, VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import { getLanguageId, initializeMonaco } from '@/plugins/code/utils/simple-monaco-config'
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
}>()

const editor = shallowRef<any>()
const models = new Map<string, any>()
const viewStates = new Map<string, any>()

const resolvedLanguage = computed(() => 
  props.language || (props.filePath ? getLanguageId(props.filePath) : 'typescript')
)

const editorOptions = computed(() => ({
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  readOnly: props.readOnly,
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'currentDocument' as const,
}))

const diffEditorOptions = computed(() => ({
  ...editorOptions.value,
  renderSideBySide: true,
  originalEditable: false,
}))

const switchToFile = (filePath: string, content: string) => {
  if (!editor.value || !filePath) return
  
  const monaco = (window as any).monaco
  if (!monaco) return
  
  // Save current file's view state
  const currentModel = editor.value.getModel()
  if (currentModel) {
    // Get the path from the model's URI for consistency
    const currentModelPath = currentModel.uri.fsPath || currentModel.uri.path
    viewStates.set(currentModelPath, editor.value.saveViewState())
  }
  
  // Get or create model for new file
  let model = models.get(filePath)
  if (!model) {
    // Use Monaco's file URI helper which handles paths correctly
    const uri = monaco.Uri.file(filePath)
    model = monaco.editor.createModel(content, resolvedLanguage.value, uri)
    models.set(filePath, model)
    
    model.onDidChangeContent(() => {
      emit('update:modelValue', model.getValue())
      emit('change', model.getValue())
    })
  } else if (model.getValue() !== content) {
    model.setValue(content)
  }
  
  // Switch to new model and restore view state
  editor.value.setModel(model)
  const savedState = viewStates.get(filePath)
  if (savedState) {
    editor.value.restoreViewState(savedState)
  }
}

const handleMount = (editorInstance: any) => {
  editor.value = editorInstance
  initializeMonaco()
  
  // Register custom actions
  const monaco = (window as any).monaco
  if (monaco) {
    registerInsertConsoleLogAction(editorInstance, monaco)
  }
  
  if (props.filePath && props.modelValue) {
    switchToFile(props.filePath, props.modelValue)
  }
}

const handleDiffMount = (diffEditorInstance: any) => {
  initializeMonaco()
  const modifiedEditor = diffEditorInstance.getModifiedEditor()
  modifiedEditor.onDidChangeModelContent(() => {
    if (!props.readOnly) {
      emit('update:modelValue', modifiedEditor.getValue())
      emit('change', modifiedEditor.getValue())
    }
  })
}

watch(() => [props.filePath, props.modelValue], ([newPath, newContent]) => {
  if (!props.diffMode && newPath && newContent !== undefined && editor.value) {
    switchToFile(newPath as string, newContent as string)
  }
})

onBeforeUnmount(() => {
  models.forEach(model => model.dispose())
  models.clear()
  viewStates.clear()
})
</script>

<style scoped>
.monaco-editor-container {
  min-height: 200px;
}

/* Ensure Monaco overlay widgets (tooltips, diagnostics) appear above other UI elements */
.monaco-editor-container :deep(.monaco-editor-overlaymessage),
.monaco-editor-container :deep(.monaco-hover),
.monaco-editor-container :deep(.monaco-editor-hover),
.monaco-editor-container :deep(.monaco-editor .zone-widget),
.monaco-editor-container :deep(.monaco-editor .monaco-hover-content) {
  z-index: 100 !important;
}
</style>