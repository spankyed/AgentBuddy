<template>
  <div
    class="tiptap-wrapper"
    :class="[`tiptap-${mode}`, `tiptap-${mode}-${variant}`, $attrs.class]"
    @click="onWrapperClick"
  >
    <template v-if="editor">
      <template v-if="cfg.blockMenu && showGutter">
        <TiptapBlockMenu :editor="editor" />
        <TiptapImageBubbleMenu :editor="editor" @view-image="(src: string) => emit('imageClick', src)" />
      </template>
      <TiptapBubbleMenu v-if="cfg.textBubbleMenu" :editor="editor" />
    </template>
    <editor-content :editor="editor" :class="editorClass" />
    <ReferenceSuggestionPopup v-if="editor && cfg.referencePopup" :editor="editor" :variant="variant" />
    <CommandSuggestionPopup v-if="editor && cfg.commandPopup" :editor="editor" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Selection } from '@tiptap/pm/state'
import { createExtensions, type TiptapMode, type TiptapVariant } from './extensions'
import { getEditorConfig } from './editor-config'
import TiptapBlockMenu from './TiptapBlockMenu.vue'
import TiptapBubbleMenu from './TiptapBubbleMenu.vue'
import TiptapImageBubbleMenu from './TiptapImageBubbleMenu.vue'
import ReferenceSuggestionPopup from './ReferenceSuggestionPopup.vue'
import CommandSuggestionPopup from './CommandSuggestionPopup.vue'
import { commandSuggestionPluginKey } from './command-suggestion-plugin'
import { createImageHandlers } from './composables/createImageHandlers'
import { createEditorClickHandler, createViewerClickHandler } from './composables/createEditorClickHandler'
import { useSubDocumentTracking } from './composables/useSubDocumentTracking'
import { createKeyboardHandler } from './composables/createEditorKeyboard'
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
  showGutter?: boolean
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
  showGutter: false,
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
  (e: 'clearInput'): void
  (e: 'imageClick', src: string): void
}>()

defineOptions({ inheritAttrs: false })

const cfg = getEditorConfig(props.mode, props.variant)

function onWrapperClick(event: MouseEvent) {
  if (!cfg.editable || !editor.value) return
  const target = event.target as HTMLElement
  if (target === event.currentTarget || target.classList.contains('tiptap-wrapper')) {
    editor.value.chain().focus('end').run()
  }
}

const { suppressNodeDeletionEvents, onTransaction: subDocOnTransaction } = useSubDocumentTracking({
  subDocumentLinkDeleted: (id) => emit('subDocumentLinkDeleted', id),
  subDocumentLinkRestored: (id) => emit('subDocumentLinkRestored', id),
})

const lastResetMarkdown = ref<string | null>(null)
// Track values we've emitted to recognize echoes from parent (debounced round-trip)
const emittedValues = new Set<string>()

function getMarkdown(): string {
  return (editor.value!.storage as any).markdown.getMarkdown()
}

function selectStart(e: { state: import('@tiptap/pm/state').EditorState, view: import('@tiptap/pm/view').EditorView }) {
  const { tr } = e.state
  tr.setSelection(Selection.atStart(e.state.doc))
  e.view.dispatch(tr)
}

// Set content without recording in undo history so note switches can't be undone.
//
// Do NOT call `markdown.parser.parse(content)` here and pass the HTML result
// to setContent. The tiptap-markdown Markdown extension already overrides
// `setContent` to call `parser.parse` internally
// (see node_modules/tiptap-markdown/src/Markdown.js:22-39). A manual pre-parse
// produces an HTML string, which the override then parses as markdown a
// second time — and with `markdownHtml: false` on the chat viewer, markdown-it
// escapes HTML tags into literal text, so the user sees raw `<p>`, `<code>`,
// `<h2>` characters in their streaming bubble. Pass the markdown string
// straight through and let the override handle the single parse.
function resetContent(content: string, resetSelection = false) {
  if (!editor.value) return
  suppressNodeDeletionEvents.value = true
  editor.value.chain().setMeta('addToHistory', false).setContent(content).run()
  if (resetSelection) selectStart(editor.value)
  lastResetMarkdown.value = getMarkdown()
  suppressNodeDeletionEvents.value = false
}

// Build editorProps from composables
const imageHandlers = cfg.editorInteractions
  ? createImageHandlers(() => editor.value, () => props.entityId, () => props.disableImages || !props.entityId)
  : {}

const clickHandler = cfg.editorInteractions
  ? { handleClick: createEditorClickHandler({ noteLinkClick: (id) => emit('noteLinkClick', id), imageClick: (src) => emit('imageClick', src) }) }
  : cfg.viewerImageClick
    ? { handleClick: createViewerClickHandler({ imageClick: (src) => emit('imageClick', src) }) }
    : {}

const handleKeyDown = createKeyboardHandler({
  cfg,
  getEditor: () => editor.value,
  getInHistoryMode: () => props.inHistoryMode,
  emit: {
    submit: () => emit('submit'),
    focusTitle: () => emit('focusTitle'),
    historyPrev: () => emit('history-prev'),
    historyNext: () => emit('history-next'),
    clearInput: () => emit('clearInput'),
  },
})

const editor = useEditor({
  extensions: createExtensions({
    mode: props.mode,
    variant: props.variant,
    placeholder: props.placeholder,
    isCommand: props.isCommand,
  }),
  content: props.modelValue,
  editable: cfg.editable && !props.disabled,
  editorProps: {
    handleKeyDown,
    ...clickHandler,
    ...imageHandlers,
  },
  onCreate: ({ editor: e }) => {
    selectStart(e)
  },
  onUpdate: () => {
    if (suppressNodeDeletionEvents.value) return
    const md = getMarkdown()
    if (lastResetMarkdown.value !== null && md === lastResetMarkdown.value) return
    lastResetMarkdown.value = null
    emittedValues.add(md)
    emit('update:modelValue', md)
  },
  ...(cfg.subDocumentTracking && { onTransaction: subDocOnTransaction }),
})

// Sync modelValue changes from parent into the editor.
// In viewer mode the editor is read-only — skip the getMarkdown() round-trip
// comparison which can silently skip legitimate updates when the serializer
// normalizes whitespace differently from the source markdown.
watch(() => props.modelValue, (newVal) => {
  if (!editor.value) return
  if (emittedValues.delete(newVal)) return
  if (!cfg.editable) { resetContent(newVal); return }
  if (newVal !== getMarkdown()) resetContent(newVal)
})

// Force-reset editor content on entity switch to prevent stale content display
watch(() => props.entityId, () => {
  emittedValues.clear()
  resetContent(props.modelValue, true)
})

watch(() => props.disabled, (disabled) => {
  if (editor.value) editor.value.setEditable(!disabled && cfg.editable)
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
