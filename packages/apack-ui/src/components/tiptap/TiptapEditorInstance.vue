<template>
  <div
    class="tiptap-wrapper"
    :class="[`tiptap-${mode}`, `tiptap-${mode}-${variant}`, $attrs.class]"
    @mousedown="onWrapperMouseDown"
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
    <!--
      Keyed by index, which is safe here and has nothing better available: `pluginPopups` is read once per
      instance, so this list never changes while it is mounted — a pack arriving replaces the whole instance.
      The component itself is not a key: `@apackdev/sdk` is a shared instance, so two packs can contribute the
      same `Component` reference (the reason `createOwnedList` removes by owner rather than by value), which
      would be a duplicate key.
    -->
    <component
      v-for="(popup, i) in pluginPopups"
      :key="i"
      :is="popup"
      :editor="editor"
      :variant="variant"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Selection } from '@tiptap/pm/state'
import { createExtensions } from './extensions.ts'
import { getEditorConfig } from './editor-config.ts'
import { tiptapPluginRegistry } from '@apackdev/sdk/fe'
import type { ResolvedTiptapEditorProps, TiptapEditorEmit } from './internal/tiptap-editor-props.ts'
import TiptapBlockMenu from './TiptapBlockMenu.vue'
import TiptapBubbleMenu from './TiptapBubbleMenu.vue'
import TiptapImageBubbleMenu from './TiptapImageBubbleMenu.vue'
import { createImageHandlers } from './composables/createImageHandlers.ts'
import { createEditorClickHandler, createViewerClickHandler } from './composables/createEditorClickHandler.ts'
import { useSubDocumentTracking } from './composables/useSubDocumentTracking.ts'
import { createKeyboardHandler } from './composables/createEditorKeyboard.ts'

/**
 * Everything the editor is built from, read fresh on every mount. `TiptapEditor.vue` remounts this component
 * when the registered packs change, which is what makes these reads current — a ProseMirror schema is fixed
 * at creation, so an extension cannot be added to a live editor.
 */
const props = defineProps<ResolvedTiptapEditorProps & {
  /**
   * The markdown to open with in place of `modelValue`, which the wrapper takes off the editor being replaced
   * so a rebuild does not discard text typed but not yet emitted. Absent on a first mount.
   */
  seed?: string
  /** The wrapper's echo set, which has to span a rebuild: it tracks emissions the parent is still echoing back */
  emittedValues: Set<string>
  /** The wrapper's own `emit`, passed rather than redeclared, so the emit list exists in one place */
  emit: TiptapEditorEmit
}>()

const emit = props.emit
const emittedValues = props.emittedValues

defineOptions({ inheritAttrs: false })

const tiptapPlugins = tiptapPluginRegistry.getAll()
const injectedExtensions = tiptapPlugins.flatMap(p => p.extensions ?? [])
const pluginPopups = tiptapPlugins.flatMap(p => p.popups ?? [])
const isSuggestionActive = (view: import('@tiptap/pm/view').EditorView) =>
  tiptapPlugins.some(p => p.isSuggestionActive?.(view.state))

const cfg = getEditorConfig(props.mode, props.variant)

// `click` fires on the lowest common ancestor of the mousedown and mouseup
// targets. Pressing inside the editor content and releasing on a sibling
// like the block-menu `+` or drag handle would otherwise fire this handler
// on the wrapper and scroll to the bottom. Only honor clicks whose gesture
// both started and ended on the wrapper itself.
let wrapperPressed = false
function onWrapperMouseDown(event: MouseEvent) {
  wrapperPressed = event.target === event.currentTarget
}
function onWrapperClick(event: MouseEvent) {
  const pressed = wrapperPressed
  wrapperPressed = false
  if (!pressed || event.target !== event.currentTarget) return
  if (!cfg.editable || !editor.value) return
  editor.value.chain().focus('end').run()
}

const { suppressNodeDeletionEvents, onTransaction: subDocOnTransaction } = useSubDocumentTracking({
  subDocumentLinkDeleted: (id) => emit('subDocumentLinkDeleted', id),
  subDocumentLinkRestored: (id) => emit('subDocumentLinkRestored', id),
})

const lastResetMarkdown = ref<string | null>(null)

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
    ? { handleClick: createViewerClickHandler({ imageClick: (src) => emit('imageClick', src), openLink: props.openViewerLink }) }
    : {}

const handleKeyDown = createKeyboardHandler({
  cfg,
  getEditor: () => editor.value,
  getInHistoryMode: () => props.inHistoryMode,
  getPauseAvailable: () => props.pauseAvailable,
  isSuggestionActive,
  emit: {
    submit: () => emit('submit'),
    focusTitle: () => emit('focusTitle'),
    historyPrev: () => emit('history-prev'),
    historyNext: () => emit('history-next'),
    clearInput: () => emit('clearInput'),
    pause: () => emit('pause'),
    openRevertMenu: () => emit('open-revert-menu'),
  },
})

const editor = useEditor({
  extensions: createExtensions({
    mode: props.mode,
    variant: props.variant,
    placeholder: props.placeholder,
    injectedExtensions,
  }),
  // A viewer opens from `modelValue` even on a rebuild: its serializer normalises whitespace differently from
  // the source markdown (see the `modelValue` watcher below), and it holds no edit worth carrying over
  content: cfg.editable ? (props.seed ?? props.modelValue) : props.modelValue,
  editable: cfg.editable && !props.disabled,
  editorProps: {
    handleKeyDown,
    ...clickHandler,
    ...imageHandlers,
  },
  onCreate: ({ editor: e }) => {
    // Only on a first mount. `onCreate` runs a macrotask after construction, so on a rebuild this would move
    // the caret to the top of the document a moment after the user had clicked back into the editor
    if (props.seed === undefined) selectStart(e)
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

defineExpose({ editor })
</script>

<style>
@import "./tiptap-theme.css";
</style>
