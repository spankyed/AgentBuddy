<template>
  <div
    class="tiptap-wrapper"
    :class="[`tiptap-${mode}`, $attrs.class]"
  >
    <template v-if="editor">
      <template v-if="mode === 'editor' && variant === 'full' && !hideGutter">
        <TiptapBlockMenu :editor="editor" />
        <TiptapImageBubbleMenu :editor="editor" />
      </template>
      <TiptapBubbleMenu v-if="mode === 'editor' || (mode === 'input' && variant === 'chat')" :editor="editor" />
    </template>
    <editor-content :editor="editor" :class="editorClass" />
    <ReferenceSuggestionPopup v-if="editor && mode !== 'viewer'" :editor="editor" :variant="variant" />
    <CommandSuggestionPopup v-if="editor && mode === 'input' && variant === 'chat'" :editor="editor" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Selection } from '@tiptap/pm/state'
import { splitBlock } from '@tiptap/pm/commands'
import { createExtensions, type TiptapMode, type TiptapVariant } from './extensions'
import TiptapBlockMenu from './TiptapBlockMenu.vue'
import TiptapBubbleMenu from './TiptapBubbleMenu.vue'
import TiptapImageBubbleMenu from './TiptapImageBubbleMenu.vue'
import ReferenceSuggestionPopup from './ReferenceSuggestionPopup.vue'
import CommandSuggestionPopup from './CommandSuggestionPopup.vue'
import { commandSuggestionPluginKey } from './command-suggestion-plugin'
import './tiptap-theme.css'

const props = withDefaults(defineProps<{
  mode: TiptapMode
  variant?: TiptapVariant
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  editorClass?: string
  entityId?: string
  disableImages?: boolean
  hideGutter?: boolean
  isCommand?: boolean
  inHistoryMode?: boolean
}>(), {
  variant: 'full',
  modelValue: '',
  placeholder: '',
  disabled: false,
  editorClass: '',
  entityId: undefined,
  disableImages: false,
  isCommand: false,
  inHistoryMode: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'noteLinkClick', noteId: string): void
  (e: 'subDocumentLinkDeleted', noteId: string): void
  (e: 'subDocumentLinkRestored', noteId: string): void
  (e: 'focusTitle'): void
  (e: 'history-prev'): void
  (e: 'history-next'): void
  (e: 'imageClick', src: string): void
}>()

defineOptions({ inheritAttrs: false })

function selectStart(e: { state: import('@tiptap/pm/state').EditorState, view: import('@tiptap/pm/view').EditorView }) {
  const { tr } = e.state
  tr.setSelection(Selection.atStart(e.state.doc))
  e.view.dispatch(tr)
}

const suppressNodeDeletionEvents = ref(false)
const lastResetMarkdown = ref<string | null>(null)

function getMarkdown(): string {
  return (editor.value!.storage as any).markdown.getMarkdown()
}

function resetContent(content: string) {
  if (!editor.value) return
  suppressNodeDeletionEvents.value = true
  const parsed = (editor.value.storage as any).markdown.parser.parse(content)
  // Set content without recording in undo history so note switches can't be undone
  editor.value.chain().setMeta('addToHistory', false).setContent(parsed).run()
  selectStart(editor.value)
  lastResetMarkdown.value = getMarkdown()
  suppressNodeDeletionEvents.value = false
}

function collectSubDocumentLinkIds(doc: any): Set<string> {
  const ids = new Set<string>()
  doc.descendants((node: any) => {
    if (node.type.name === 'subDocumentLink' && node.attrs.noteId) {
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

const editorOnlyProps = props.mode === 'editor' ? {
  handleClick: (_view: any, _pos: any, event: MouseEvent) => {
    // Sub-document links open on regular click (no modifier needed)
    const subDocumentEl = (event.target as HTMLElement).closest('.sub-document-link')
    if (subDocumentEl) {
      const noteId = subDocumentEl.getAttribute('data-note-id')
      if (noteId) {
        emit('noteLinkClick', noteId)
        return true
      }
    }
    // document:// inline links also open on regular click (no modifier needed)
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (href?.startsWith('document://')) {
      emit('noteLinkClick', href.slice('document://'.length))
      return true
    }
    // Other links require ctrl/cmd+click in editor mode
    if (!(event.ctrlKey || event.metaKey)) return false
    if (!href) return false
    if (href.startsWith('note://')) {
      emit('noteLinkClick', href.slice('note://'.length))
      return true
    }
    const url = /^https?:\/\//.test(href) ? href : `https://${href}`
    window.electronAPI?.shell?.openExternal(url)
    return true
  },
  handlePaste: (_view: any, event: ClipboardEvent) => {
    if (props.disableImages || !props.entityId) return false
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
  handleDrop: (view: any, event: DragEvent) => {
    if (props.disableImages || !props.entityId) return false
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
} : {}

const viewerClickProps = props.mode === 'viewer' ? {
  handleClick: (_view: any, _pos: any, event: MouseEvent) => {
    const img = (event.target as HTMLElement).closest('img')
    if (img?.src) {
      emit('imageClick', img.src)
      return true
    }
    return false
  },
} : {}

const editorOnlyTransaction = props.mode === 'editor' ? {
  onTransaction: ({ transaction }: { transaction: any }) => {
    if (!transaction.docChanged || suppressNodeDeletionEvents.value) return
    const oldIds = collectSubDocumentLinkIds(transaction.before)
    const newIds = collectSubDocumentLinkIds(transaction.doc)
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        emit('subDocumentLinkDeleted', id)
      }
    }
    for (const id of newIds) {
      if (!oldIds.has(id)) {
        emit('subDocumentLinkRestored', id)
      }
    }
  },
} : {}

/** Returns true when ProseMirror's default Enter behavior should take over. */
function shouldDeferEnter(view: import('@tiptap/pm/view').EditorView): boolean {
  const { $head } = view.state.selection

  if ($head.parent.type.name === 'codeBlock') return true

  for (let d = $head.depth; d > 0; d--) {
    if ($head.node(d).type.name === 'listItem') return true
  }

  const textBefore = $head.parent.textBetween(0, $head.parentOffset, undefined, '\ufffc')
  if (/^(`{3}|~{3})[a-z]*$/.test(textBefore)) return true

  return false
}

const editor = useEditor({
  extensions: createExtensions({
    mode: props.mode,
    variant: props.variant,
    placeholder: props.placeholder,
    isCommand: props.isCommand,
  }),
  content: props.modelValue,
  editable: props.mode !== 'viewer' && !props.disabled,
  editorProps: {
    handleKeyDown: (view, event) => {
      // ⌘+Shift+V → paste as plain text, parsed as markdown for structure
      if (event.key === 'v' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        navigator.clipboard.readText().then(text => {
          if (!text || !editor.value) return
          editor.value.commands.insertContent(text)
        })
        return true
      }

      if (props.mode === 'input') {
        const isEmpty = !view.state.doc.textContent.trim()

        if (event.key === 'ArrowUp' && (isEmpty || props.inHistoryMode)) {
          emit('history-prev')
          return true
        }
        if (event.key === 'ArrowDown' && (isEmpty || props.inHistoryMode)) {
          emit('history-next')
          return true
        }
      }

      // ⌘/Ctrl+X on empty selection → cut entire line
      if (event.key === 'x' && (event.metaKey || event.ctrlKey) && view.state.selection.empty) {
        event.preventDefault()
        const { $from } = view.state.selection
        const lineText = $from.parent.textContent
        navigator.clipboard.writeText(lineText)
        const tr = view.state.tr.deleteRange($from.before(), $from.after())
        view.dispatch(tr)
        return true
      }

      if (event.key === 'Tab') {
        const cmd = event.shiftKey ? 'liftListItem' : 'sinkListItem'
        editor.value?.commands[cmd]('listItem') || editor.value?.commands[cmd]('taskItem')
        return true
      }

      if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && view.state.selection.from <= 1) {
        emit('focusTitle')
        return true
      }

      if (props.mode === 'input' && event.key === 'Enter') {
        if (shouldDeferEnter(view)) return false

        if (event.shiftKey) {
          return splitBlock(view.state, view.dispatch)
        }

        emit('submit')
        return true
      }

      return false
    },
    ...editorOnlyProps,
    ...viewerClickProps,
  },
  onCreate: ({ editor: e }) => {
    selectStart(e)
  },
  onUpdate: ({ editor: e }) => {
    if (suppressNodeDeletionEvents.value) return
    const md = getMarkdown()
    if (lastResetMarkdown.value !== null && md === lastResetMarkdown.value) return
    lastResetMarkdown.value = null
    emit('update:modelValue', md)
  },
  ...editorOnlyTransaction,
})

// Sync modelValue changes from parent into the editor
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  if (newVal !== getMarkdown()) {
    resetContent(newVal)
  }
})

// Force-reset editor content on entity switch to prevent stale content display
watch(() => props.entityId, () => {
  resetContent(props.modelValue)
})

// Sync disabled/editable
watch(() => props.disabled, (disabled) => {
  if (editor.value) {
    editor.value.setEditable(!disabled && props.mode !== 'viewer')
  }
})

const commandPluginState = computed(() => {
  if (!editor.value) return null
  return commandSuggestionPluginKey.getState(editor.value.state)
})

const commandModeActive = computed(() => {
  const s = commandPluginState.value
  return s?.active === true && s.selectedCommand != null
})

const commandActive = computed(() => {
  return commandPluginState.value?.active === true
})

defineExpose({ editor, commandModeActive, commandActive })
</script>
