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
      v-model:value="editorValue"
      :theme="theme || 'vs-dark'"
      :language="resolvedLanguage"
      :options="editorOptions"
      @mount="handleMount"
      class="h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef } from 'vue'
import { VueMonacoEditor, VueMonacoDiffEditor } from '@guolao/vue-monaco-editor'
import { getLanguageId } from '@/plugins/code/utils/simple-monaco-config'

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
const editor = shallowRef()
const diffEditor = shallowRef()

// Local value for two-way binding
const editorValue = ref(props.modelValue)

// Computed language
const resolvedLanguage = computed(() => {
  return props.language || (props.filePath ? getLanguageId(props.filePath) : 'typescript')
})

// Common editor options
const commonOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  folding: true,
  bracketPairColorization: { enabled: true },
  formatOnPaste: true,
  formatOnType: true,
  // Disable most IntelliSense features
  quickSuggestions: false,
  parameterHints: { enabled: false },
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnCommitCharacter: false,
  acceptSuggestionOnEnter: 'off',
  snippetSuggestions: 'none',
  wordBasedSuggestions: 'currentDocument',
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

// Handle editor mount
const handleMount = (editorInstance: any) => {
  editor.value = editorInstance
}

// Handle diff editor mount
const handleDiffMount = (diffEditorInstance: any) => {
  diffEditor.value = diffEditorInstance
  
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

// Watch for value changes from parent
watch(() => props.modelValue, (newValue) => {
  if (newValue !== editorValue.value) {
    editorValue.value = newValue
  }
})

// Emit changes
watch(editorValue, (newValue) => {
  if (newValue !== props.modelValue) {
    emit('update:modelValue', newValue)
    emit('change', newValue)
  }
})

// Watch for diff content changes
watch(() => [props.originalContent, props.modifiedContent], () => {
  // VueMonacoDiffEditor handles prop changes automatically
})
</script>

<style scoped>
.monaco-editor-container {
  min-height: 200px;
}
</style>