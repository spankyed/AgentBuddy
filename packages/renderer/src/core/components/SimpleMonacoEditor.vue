<template>
  <div class="w-full h-full monaco-editor-wrapper">
    <VueMonacoEditor
      :theme="theme"
      :value="modelValue"
      :options="mergedOptions"
      :language="language"
      @mount="handleMount"
      @update:value="handleUpdate"
      class="h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import type { editor } from 'monaco-editor'
import {
  defaultEditorOptions,
  readOnlyEditorOptions,
  minimalEditorOptions,
  createEditorKeybindings,
  setupJsonValidation,
  setupJavaScriptValidation,
} from '@/core/utils/monaco-editor-config'

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
}

const props = withDefaults(defineProps<SimpleMonacoEditorProps>(), {
  language: 'javascript',
  readOnly: false,
  minimal: false,
  theme: 'vs-dark',
  executeKey: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'execute': []
  'change': [value: string]
  'cursorChange': [position: { line: number; col: number }]
}>()

const editorRef = shallowRef<editor.IStandaloneCodeEditor>()

const mergedOptions = computed<editor.IStandaloneEditorConstructionOptions>(() => {
  const baseOptions = props.readOnly
    ? readOnlyEditorOptions
    : props.minimal
    ? minimalEditorOptions
    : defaultEditorOptions
  
  return {
    ...baseOptions,
    ...props.options,
    readOnly: props.readOnly,
  }
})

const handleUpdate = (value: string | undefined) => {
  const newValue = value || ''
  emit('update:modelValue', newValue)
  emit('change', newValue)
}

const handleMount = (editor: editor.IStandaloneCodeEditor) => {
  editorRef.value = editor
  const monaco = (window as any).monaco
  
  if (!monaco) return
  
  // Set up language-specific validation
  if (props.language === 'json') {
    setupJsonValidation(monaco)
  } else if (props.language === 'javascript' || props.language === 'typescript') {
    setupJavaScriptValidation(monaco)
  }
  
  // Add execute keybindings if requested
  if (props.executeKey) {
    const actions = createEditorKeybindings(monaco, () => emit('execute'))
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
  
  // Handle content changes
  editor.onDidChangeModelContent(() => {
    const value = editor.getValue()
    handleUpdate(value)
  })
}
</script>

<style scoped>
.monaco-editor-wrapper {
  min-height: 100px;
}

.monaco-editor-wrapper :deep(.monaco-editor) {
  border-radius: 0.375rem;
}

.monaco-editor-wrapper :deep(.monaco-editor-overlaymessage),
.monaco-editor-wrapper :deep(.monaco-hover),
.monaco-editor-wrapper :deep(.monaco-editor-hover),
.monaco-editor-wrapper :deep(.monaco-editor .zone-widget),
.monaco-editor-wrapper :deep(.monaco-editor .monaco-hover-content) {
  z-index: 100 !important;
}
</style>