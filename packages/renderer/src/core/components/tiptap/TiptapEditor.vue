<template>
  <div
    class="tiptap-wrapper"
    :class="[`tiptap-${mode}`, $attrs.class]"
  >
    <template v-if="mode === 'editor' && editor">
      <TiptapBlockMenu :editor="editor" />
      <TiptapBubbleMenu :editor="editor" />
    </template>
    <editor-content :editor="editor" :class="editorClass" />
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createExtensions, type TiptapMode } from './extensions'
import TiptapBlockMenu from './TiptapBlockMenu.vue'
import TiptapBubbleMenu from './TiptapBubbleMenu.vue'
import './tiptap-theme.css'

const props = withDefaults(defineProps<{
  mode: TiptapMode
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  editorClass?: string
}>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  editorClass: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

defineOptions({ inheritAttrs: false })

const editor = useEditor({
  extensions: createExtensions({
    mode: props.mode,
    placeholder: props.placeholder,
  }),
  content: props.modelValue,
  editable: props.mode !== 'viewer' && !props.disabled,
  editorProps: {
    handleKeyDown: (_view, event) => {
      if (props.mode === 'input' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        emit('submit')
        return true
      }
      return false
    },
    handleClick: (_view, _pos, event) => {
      if (props.mode === 'editor' && !(event.ctrlKey || event.metaKey)) return false
      const href = (event.target as HTMLElement).closest('a')?.getAttribute('href')
      if (!href) return false
      const url = /^https?:\/\//.test(href) ? href : `https://${href}`
      window.electronAPI?.shell?.openExternal(url)
      return true
    },
  },
  onUpdate: ({ editor: e }) => {
    const md = (e.storage as any).markdown.getMarkdown()
    emit('update:modelValue', md)
  },
})

// Sync modelValue changes from parent into the editor
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentMd = (editor.value.storage as any).markdown.getMarkdown()
  if (newVal !== currentMd) {
    editor.value.commands.setContent(newVal)
  }
})

// Sync disabled/editable
watch(() => props.disabled, (disabled) => {
  if (editor.value) {
    editor.value.setEditable(!disabled && props.mode !== 'viewer')
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

defineExpose({ editor })
</script>
