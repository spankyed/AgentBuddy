<template>
  <div
    class="tiptap-wrapper"
    :class="[`tiptap-${mode}`, $attrs.class]"
  >
    <template v-if="mode === 'editor' && editor">
      <TiptapBlockMenu :editor="editor" />
      <TiptapBubbleMenu :editor="editor" />
      <TiptapImageBubbleMenu :editor="editor" />
    </template>
    <editor-content :editor="editor" :class="editorClass" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createExtensions, type TiptapMode } from './extensions'
import TiptapBlockMenu from './TiptapBlockMenu.vue'
import TiptapBubbleMenu from './TiptapBubbleMenu.vue'
import TiptapImageBubbleMenu from './TiptapImageBubbleMenu.vue'
import './tiptap-theme.css'

const props = withDefaults(defineProps<{
  mode: TiptapMode
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  editorClass?: string
  entityId?: string
}>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  editorClass: '',
  entityId: undefined,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'noteLinkClick', noteId: string): void
  (e: 'subPageLinkDeleted', noteId: string): void
}>()

defineOptions({ inheritAttrs: false })

const suppressNodeDeletionEvents = ref(false)

function collectSubPageLinkIds(doc: any): Set<string> {
  const ids = new Set<string>()
  doc.descendants((node: any) => {
    if (node.type.name === 'subPageLink' && node.attrs.noteId) {
      ids.add(node.attrs.noteId)
    }
  })
  return ids
}

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip data URI prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadAndInsertImage(file: File, editorInstance: ReturnType<typeof useEditor>['value'], pos?: number) {
  if (!editorInstance || !props.entityId) return false
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return false
  if (file.size > MAX_IMAGE_SIZE) return false

  try {
    const base64 = await fileToBase64(file)
    const url = await window.electronAPI?.media.upload(props.entityId, base64, file.type)
    if (!url) return false

    if (pos !== undefined) {
      editorInstance.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src: url } }).run()
    } else {
      editorInstance.chain().focus().setImage({ src: url }).run()
    }
    return true
  } catch (err) {
    console.error('Failed to upload image:', err)
    return false
  }
}

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
      // Sub-page links open on regular click (no modifier needed)
      const subPageEl = (event.target as HTMLElement).closest('.sub-page-link')
      if (subPageEl) {
        const noteId = subPageEl.getAttribute('data-note-id')
        if (noteId) {
          emit('noteLinkClick', noteId)
          return true
        }
      }
      // Other links require ctrl/cmd+click in editor mode
      if (props.mode === 'editor' && !(event.ctrlKey || event.metaKey)) return false
      const href = (event.target as HTMLElement).closest('a')?.getAttribute('href')
      if (!href) return false
      if (href.startsWith('note://')) {
        const noteId = href.slice('note://'.length)
        emit('noteLinkClick', noteId)
        return true
      }
      if (href.startsWith('page://')) {
        const noteId = href.slice('page://'.length)
        emit('noteLinkClick', noteId)
        return true
      }
      const url = /^https?:\/\//.test(href) ? href : `https://${href}`
      window.electronAPI?.shell?.openExternal(url)
      return true
    },
    handlePaste: (_view, event) => {
      if (props.mode !== 'editor' || !props.entityId) return false
      const items = event.clipboardData?.items
      if (!items) return false

      let handled = false
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          if (!handled) { event.preventDefault(); handled = true }
          uploadAndInsertImage(file, editor.value)
        }
      }
      return handled
    },
    handleDrop: (view, event) => {
      if (props.mode !== 'editor' || !props.entityId) return false
      const files = event.dataTransfer?.files
      if (!files?.length) return false

      let handled = false
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          if (!handled) { event.preventDefault(); handled = true }
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          uploadAndInsertImage(file, editor.value, coords?.pos)
        }
      }
      return handled
    },
  },
  onCreate: ({ editor: e }) => {
    // Prevent last image from being auto-selected on initial load
    e.commands.setTextSelection(0)
  },
  onUpdate: ({ editor: e }) => {
    const md = (e.storage as any).markdown.getMarkdown()
    emit('update:modelValue', md)
  },
  onTransaction: ({ transaction }) => {
    if (!transaction.docChanged || suppressNodeDeletionEvents.value) return
    const oldIds = collectSubPageLinkIds(transaction.before)
    const newIds = collectSubPageLinkIds(transaction.doc)
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        emit('subPageLinkDeleted', id)
      }
    }
  },
})

// Sync modelValue changes from parent into the editor
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  const currentMd = (editor.value.storage as any).markdown.getMarkdown()
  if (newVal !== currentMd) {
    suppressNodeDeletionEvents.value = true
    editor.value.commands.setContent(newVal)
    // Prevent last image from being auto-selected after content load
    editor.value.commands.setTextSelection(0)
    suppressNodeDeletionEvents.value = false
  }
})

// Force-reset editor content on entity switch to prevent stale content display
watch(() => props.entityId, () => {
  if (!editor.value) return
  suppressNodeDeletionEvents.value = true
  editor.value.commands.setContent(props.modelValue)
  editor.value.commands.setTextSelection(0)
  suppressNodeDeletionEvents.value = false
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
