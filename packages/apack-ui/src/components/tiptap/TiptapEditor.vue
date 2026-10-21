<template>
  <TiptapEditorInstance
    ref="inner"
    :key="rebuildKey"
    v-bind="{ ...props, ...$attrs }"
    :emit="emit"
    :seed="seed"
    :emitted-values="emittedValues"
  />
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onRegisteredPacksChanged } from '@apackdev/sdk/fe'
import type { TiptapEditorProps } from './internal/tiptap-editor-props.ts'
import TiptapEditorInstance from './TiptapEditorInstance.vue'

/**
 * The editor's public contract, and the one thing it does itself: rebuild the editor when the registered packs
 * change.
 *
 * A pack contributes tiptap extensions, and `ReferenceNode` among them defines a **schema node**, which
 * ProseMirror fixes when the editor is created — `editor.registerPlugin()` takes a plugin, not a node type. So
 * an editor cannot gain a pack's extensions; it can only be replaced by one built with them. Every pack's
 * frontend, the app's own included, loads after the window is up, so an editor mounted first would otherwise
 * never render a reference at all.
 *
 * Replacing it is a remount of the instance below, keyed on a counter. The counter is only read while
 * rendering, so the loader registering several packs in a row costs one rebuild rather than one each.
 *
 * What a rebuild costs: the selection and the undo history, and an image upload still in flight — its
 * insertion lands on the destroyed editor, whose `view` stub reports `isDestroyed: false`, so the transaction
 * applies to detached state and the image is lost with no error. Nothing defers a rebuild for one, because a
 * pack arriving or leaving is rare and an upload's window is short; a pack author who hits it should be told
 * to retry the upload rather than have the editor silently keep the old extension set.
 */
const props = withDefaults(defineProps<TiptapEditorProps>(), {
  variant: 'full',
  modelValue: '',
  placeholder: '',
  disabled: false,
  editorClass: '',
  entityId: undefined,
  disableImages: false,
  showGutter: false,
  inHistoryMode: false,
  pauseAvailable: false,
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
  (e: 'pause'): void
  (e: 'open-revert-menu'): void
  (e: 'imageClick', src: string): void
}>()

defineOptions({ inheritAttrs: false })

const inner = ref<InstanceType<typeof TiptapEditorInstance>>()
const rebuildKey = ref(0)

/**
 * What the replacement opens with: the document the outgoing editor holds, as markdown.
 *
 * **Markdown, not `getJSON()`.** `tiptap-markdown` passes a non-string `content` straight to
 * `Node.fromJSON`, which throws for a node type the new schema no longer has — which is exactly a pack being
 * *unregistered*, one of the two cases this rebuild exists for. The `Editor` constructor does not catch it.
 * A markdown round trip cannot throw, and it is the same round trip every save already makes.
 */
const seed = shallowRef<string | undefined>()

/** Vue unmounts the old instance before mounting the new one, so the document is read before the key moves */
const stopListening = onRegisteredPacksChanged(() => {
  const current = inner.value?.editor
  seed.value = current ? (current.storage as any).markdown?.getMarkdown() : undefined
  rebuildKey.value++
})
onScopeDispose(stopListening)

// A value arriving from the parent between the rebuild being asked for and the remount happening would
// otherwise be lost: the new instance opens from the seed, and its `modelValue` watcher is not `immediate`.
watch(() => props.modelValue, () => { seed.value = undefined })

// The echo set lives here because it has to span a rebuild: it tracks what was emitted so the parent's
// debounced echo is recognised, and that round trip can outlast the instance that started it.
const emittedValues = new Set<string>()

// Read through the instance rather than held, so it follows a rebuild for every consumer that reads
// `ref.editor` at the moment of use
defineExpose({ editor: computed(() => inner.value?.editor) })
</script>
