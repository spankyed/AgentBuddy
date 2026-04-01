<template>
  <div class="w-full h-full unified-monaco-editor">
    <!-- Diff Editor Mode -->
    <VueMonacoDiffEditor
      v-if="mode === 'diff'"
      :theme="theme"
      :original="diffOriginal || ''"
      :modified="diffModified || modelValue"
      :language="resolvedLanguage"
      :options="resolvedOptions"
      @mount="handleDiffMount"
      class="h-full"
    />
    
    <!-- Standard Editor Mode -->
    <VueMonacoEditor
      v-else
      :theme="theme"
      :value="currentValue"
      :language="resolvedLanguage"
      :options="resolvedOptions"
      @mount="handleMount"
      @update:value="handleUpdate"
      class="h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, shallowRef, onBeforeUnmount, onUnmounted } from 'vue'
import { VueMonacoEditor, VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import type { editor } from 'monaco-editor'
import {
  editorPresets,
  getLanguageFromPath,
  getDslTypeFromPath,
  isDslFile,
  getEditorPresetForFile,
  initializeMonaco,
  setupMonacoForFile,
  createEditorActions,
  updateDslParamsType,
  clearDslParamsType,
  type InitializeMonacoOptions,
  type EditorAction
} from '@/core/utils/monaco-config'

// Props interface
export interface UnifiedMonacoEditorProps {
  // Core props
  modelValue: string
  language?: string
  theme?: string
  
  // Mode control
  mode?: 'simple' | 'multi-file' | 'diff'
  
  // File-specific props
  filePath?: string
  
  // DSL control
  dslType?: 'database' | 'action' | 'prompt'
  functionBody?: boolean
  
  // Editor options
  preset?: 'default' | 'readonly' | 'minimal' | 'dsl' | 'codeEditor' | 'auto'
  readOnly?: boolean
  placeholder?: string
  options?: editor.IStandaloneEditorConstructionOptions
  
  // Diff mode props
  diffOriginal?: string
  diffModified?: string
  
  // Dynamic DSL params for autocomplete
  dslParams?: Record<string, { type: string }>

  // Features
  actions?: EditorAction[]
  executeKeybinding?: { key: string; modifiers: string[] }
  
  // Multi-file mode
  preserveViewState?: boolean
}

const props = withDefaults(defineProps<UnifiedMonacoEditorProps>(), {
  theme: 'vs-dark',
  mode: 'simple',
  preset: 'auto',
  readOnly: false,
  functionBody: false,
  preserveViewState: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'execute': []
  'mount': [editor: editor.IStandaloneCodeEditor]
  'cursorChange': [position: { line: number; col: number }]
}>()

// State
const editorInstance = shallowRef<editor.IStandaloneCodeEditor>()
const diffEditorInstance = shallowRef<editor.IStandaloneDiffEditor>()
const currentValue = ref(props.modelValue)
const models = new Map<string, editor.ITextModel>()
const viewStates = new Map<string, editor.ICodeEditorViewState | null>()

// Computed properties
const resolvedLanguage = computed(() => {
  if (props.language) return props.language
  if (props.filePath) return getLanguageFromPath(props.filePath)
  if (props.dslType) return 'typescript'
  return 'typescript'
})

const resolvedDslType = computed(() => {
  if (props.dslType) return props.dslType
  if (props.filePath) return getDslTypeFromPath(props.filePath)
  return null
})

const isDslMode = computed(() => {
  return props.functionBody || resolvedDslType.value !== null
})

const resolvedPreset = computed(() => {
  if (props.preset === 'auto') {
    if (props.readOnly) return 'readonly'
    if (isDslMode.value) return 'dsl'
    if (props.filePath) return getEditorPresetForFile(props.filePath, props.readOnly)
    return 'default'
  }
  return props.preset
})

const resolvedOptions = computed<editor.IStandaloneEditorConstructionOptions>(() => {
  const presetOptions = editorPresets[resolvedPreset.value]
  
  return {
    ...presetOptions,
    ...props.options,
    readOnly: props.readOnly,
    theme: props.theme
  }
})

// Methods for multi-file mode
const switchToFile = (filePath: string, content: string) => {
  if (!editorInstance.value || props.mode !== 'multi-file') return
  
  const monaco = (window as any).monaco
  if (!monaco) return
  
  // Save current view state
  const currentModel = editorInstance.value.getModel()
  if (currentModel && !currentModel.isDisposed() && props.preserveViewState) {
    const uri = currentModel.uri.toString()
    viewStates.set(uri, editorInstance.value.saveViewState())
  }
  
  // Get or create model for the file
  let model = models.get(filePath)
  // Model may have been disposed by the library on component unmount
  if (model && model.isDisposed()) {
    models.delete(filePath)
    model = undefined
  }
  if (!model) {
    const uri = monaco.Uri.file(filePath)
    model = monaco.editor.createModel(content, resolvedLanguage.value, uri)
    if (!model) return
    models.set(filePath, model)
    
    // Setup Monaco for this specific file
    setupMonacoForFile(monaco, {
      filePath,
      language: resolvedLanguage.value,
      isDsl: isDslFile(filePath),
      enableTypeChecking: isDslMode.value,
      enableSuggestions: isDslMode.value
    })
    
    // Listen for changes
    model.onDidChangeContent(() => {
      const value = model!.getValue()
      currentValue.value = value
      emit('update:modelValue', value)
      emit('change', value)
    })
  } else if (model.getValue() !== content) {
    model.setValue(content)
  }
  
  // Switch to the model
  editorInstance.value.setModel(model)
  
  // Restore view state
  if (props.preserveViewState && model) {
    const savedState = viewStates.get(model.uri.toString())
    if (savedState) {
      editorInstance.value.restoreViewState(savedState)
    }
  }
  
  currentValue.value = content
}

// Event handlers
const handleUpdate = (value: string | undefined) => {
  const newValue = value || ''
  currentValue.value = newValue
  emit('update:modelValue', newValue)
  emit('change', newValue)
}

const handleMount = (editor: editor.IStandaloneCodeEditor) => {
  editorInstance.value = editor
  const monaco = (window as any).monaco
  
  if (!monaco) return
  
  // Initialize Monaco with appropriate settings
  const initOptions: InitializeMonacoOptions = {
    enableTypeChecking: isDslMode.value,
    enableSuggestions: isDslMode.value,
    setupLanguages: true
  }
  initializeMonaco(initOptions)
  
  // Setup for specific file if provided
  if (props.filePath || props.dslType) {
    setupMonacoForFile(monaco, {
      filePath: props.filePath || `${props.dslType}:temp`,
      language: resolvedLanguage.value,
      isDsl: isDslMode.value,
      enableTypeChecking: isDslMode.value,
      enableSuggestions: isDslMode.value
    })
  }
  
  // Add editor actions if requested
  if (props.actions && props.actions.length > 0) {
    console.log('props.executeKeybinding: ', props.executeKeybinding);

    const actions = createEditorActions(monaco, props.actions, {
      onExecute: () => emit('execute')
    }, {
      executeKeybinding: props.executeKeybinding
    })
    actions.forEach(action => editor.addAction(action))
  }

  // Set placeholder if provided
  if (props.placeholder && !props.modelValue) {
    const model = editor.getModel()
    if (model) {
      model.setValue(props.placeholder)
    }
  }

  // Track cursor position changes
  editor.onDidChangeCursorPosition((e) => {
    emit('cursorChange', {
      line: e.position.lineNumber,
      col: e.position.column,
    })
  })

  // Handle multi-file mode (must happen before updateDslParamsType so it doesn't overwrite params)
  if (props.mode === 'multi-file' && props.filePath && props.modelValue) {
    switchToFile(props.filePath, props.modelValue)
  }

  // Apply dynamic params type if provided (after switchToFile so it isn't cleared)
  if (props.dslParams) {
    const dslType = props.dslType || resolvedDslType.value
    if (dslType === 'action' || dslType === 'prompt') {
      updateDslParamsType(monaco, dslType, props.dslParams)
    }
  }
  
  // Emit mount event
  emit('mount', editor)
}

const handleDiffMount = (diffEditor: editor.IStandaloneDiffEditor) => {
  diffEditorInstance.value = diffEditor
  const monaco = (window as any).monaco
  if (!monaco) return

  // Initialize Monaco
  initializeMonaco({
    enableTypeChecking: false,
    enableSuggestions: false
  })

  const modifiedEditor = diffEditor.getModifiedEditor()
  modifiedEditor.onDidChangeModelContent(() => {
    if (!props.readOnly) {
      const value = modifiedEditor.getValue()
      currentValue.value = value
      emit('update:modelValue', value)
      emit('change', value)
    }
  })
}

// Watch for file/content changes in multi-file mode
watch(
  () => [props.filePath, props.modelValue],
  ([newPath, newContent]) => {
    if (props.mode === 'multi-file' && newPath && newContent !== undefined && editorInstance.value) {
      currentValue.value = newContent as string
      switchToFile(newPath as string, newContent as string)
    } else if (props.mode === 'simple' && newContent !== currentValue.value) {
      currentValue.value = newContent as string
    }
  }
)

// Watch for mode changes to clean up stale references
watch(() => props.mode, (newMode, oldMode) => {
  if (oldMode === 'diff') {
    // Detach models before v-if unmounts the library component —
    // prevents library's onUnmounted from disposing models before the editor
    try { diffEditorInstance.value?.setModel(null) } catch {}
    diffEditorInstance.value = undefined
  }
  if (oldMode === 'multi-file') {
    // VueMonacoEditor is being destroyed — library disposes our models
    models.clear()
    viewStates.clear()
  }
  // Editor instance will be stale after mode switch
  editorInstance.value = undefined
})

// Watch for dslParams changes
watch(() => props.dslParams, (newParams) => {
  const monaco = (window as any).monaco
  if (!monaco || !isDslMode.value) return
  const dslType = props.dslType || (props.filePath ? getDslTypeFromPath(props.filePath) : null)
  if (!dslType || dslType === 'database') return
  if (newParams) {
    updateDslParamsType(monaco, dslType as 'action' | 'prompt', newParams)
  } else {
    clearDslParamsType(monaco)
  }
}, { deep: true })

// Cleanup
onBeforeUnmount(() => {
  // Detach models from editors so library cleanup doesn't clash with our disposal
  try { editorInstance.value?.setModel(null) } catch {}
  try { diffEditorInstance.value?.setModel(null) } catch {}
})

onUnmounted(() => {
  // Clear dynamic params type if in DSL mode
  if (isDslMode.value) {
    const monaco = (window as any).monaco
    if (monaco) {
      clearDslParamsType(monaco)
    }
  }

  // Library child components have already cleaned up by now
  models.forEach(model => {
    if (!model.isDisposed()) {
      try { model.dispose() } catch {}
    }
  })
  models.clear()
  viewStates.clear()
  editorInstance.value = undefined
  diffEditorInstance.value = undefined
})

// Expose methods for external use
defineExpose({
  getEditor: () => editorInstance.value,
  switchToFile,
  getValue: () => currentValue.value,
  setValue: (value: string) => {
    if (editorInstance.value) {
      const model = editorInstance.value.getModel()
      if (model) {
        model.setValue(value)
      }
    }
  }
})
</script>

<style scoped>
.unified-monaco-editor {
  min-height: 100px;
}

.unified-monaco-editor :deep(.monaco-editor) {
  border-radius: 0.375rem;
}

/* Ensure Monaco overlay widgets appear above other UI elements */
.unified-monaco-editor :deep(.monaco-editor-overlaymessage),
.unified-monaco-editor :deep(.monaco-hover),
.unified-monaco-editor :deep(.monaco-editor-hover),
.unified-monaco-editor :deep(.monaco-editor .zone-widget),
.unified-monaco-editor :deep(.monaco-editor .monaco-hover-content) {
  z-index: 100 !important;
}

/* Fix for suggest widget cutoff issues */
.unified-monaco-editor :deep(.monaco-editor .suggest-widget) {
  z-index: 1000 !important;
}

/* Ensure proper overflow handling for Monaco containers */
.unified-monaco-editor :deep(.monaco-editor .overflow-guard) {
  overflow: visible !important;
}

/* Ensure suggest details widget is visible */
.unified-monaco-editor :deep(.monaco-editor .suggest-details) {
  z-index: 1001 !important;
}
</style>