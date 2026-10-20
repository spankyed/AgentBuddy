import { Editor, type EditorOptions } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { tiptapPluginRegistry, type TiptapPluginBinding } from '@apackdev/sdk/fe'
import { createLogger } from '@apackdev/sdk/logger'

interface SavedDocument {
  document: JSONContent
  selection: ReturnType<Selection['toJSON']>
  marks: Record<string, unknown>[] | null
  focused: boolean
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}

function extensions(groups: TiptapPluginBinding[]) {
  return groups.flatMap(group => Object.entries(group.binding.extensions ?? {})
    .map(([name, extension]) => [`${group.packId}/${group.groupId}/${name}`, extension] as const))
}

/** Accepted bindings own executable lifetime; only document data survives a replacement. */
export function useContributedEditor(options: (groups: TiptapPluginBinding[]) => Partial<EditorOptions>) {
  const editor = shallowRef<Editor>()
  const groups = shallowRef<TiptapPluginBinding[]>([])
  const generation = shallowRef(0)
  const problem = shallowRef<string>()
  const logger = createLogger('editor-contributions')
  let mounted = false
  let revision = 0
  let saved: SavedDocument | undefined
  let retirement = Promise.resolve()
  let stop: (() => void) | undefined

  function dispose(value: Editor) {
    try { value.destroy() }
    catch (error) {
      logger.error('Editor destruction failed', { error })
      try { value.unmount() } catch (error) { logger.error('Editor view cleanup failed', { error }) }
      value.removeAllListeners()
    }
  }

  async function refresh(force = false) {
    if (!mounted) return
    const next = tiptapPluginRegistry.getAll()
    const previous = editor.value
    const currentExtensions = extensions(groups.value)
    const nextExtensions = extensions(next)
    if (!force && previous && currentExtensions.length === nextExtensions.length
      && currentExtensions.every(([id, extension], index) => id === nextExtensions[index][0] && extension === nextExtensions[index][1])) {
      // Popup/predicate replacement does not change the document schema or its history.
      if (groups.value.length !== next.length || groups.value.some((group, index) => group.packId !== next[index].packId
        || group.groupId !== next[index].groupId || group.binding !== next[index].binding)) generation.value++
      groups.value = next
      return
    }
    const attempt = ++revision
    if (previous) saved = {
      document: previous.getJSON(), selection: previous.state.selection.toJSON(),
      marks: previous.state.storedMarks?.map(mark => mark.toJSON()) ?? null, focused: previous.isFocused,
    }
    editor.value = undefined
    groups.value = []
    generation.value++
    if (previous) retirement = nextTick().then(() => { dispose(previous) })
    let candidate: Editor | undefined
    try {
      await retirement
      if (!mounted || revision !== attempt) return
      const snapshot = saved
      const configured = options(next)
      candidate = new Editor({ ...configured, ...(snapshot && { content: '' }),
        onCreate: event => {
          if (editor.value === event.editor && !snapshot) configured.onCreate?.(event)
        },
        onUpdate: event => { if (editor.value === event.editor) configured.onUpdate?.(event) },
        onTransaction: event => { if (editor.value === event.editor) configured.onTransaction?.(event) },
      })
      if (snapshot) {
        const document = candidate.schema.nodeFromJSON(snapshot.document)
        document.check()
        if (canonical(document.toJSON()) !== canonical(snapshot.document)) throw new Error('Replacement schema changes stored document data')
        candidate.chain().setMeta('addToHistory', false)
          .setContent(snapshot.document, { emitUpdate: false, errorOnInvalidContent: true }).run()
        if (canonical(candidate.getJSON()) !== canonical(snapshot.document)) throw new Error('Replacement editor changes stored document data')
        const marks = snapshot.marks?.map(mark => candidate!.schema.markFromJSON(mark)) ?? null
        if (canonical(marks?.map(mark => mark.toJSON()) ?? null) !== canonical(snapshot.marks)) throw new Error('Replacement schema changes pending marks')
        candidate.view.dispatch(candidate.state.tr
          .setSelection(Selection.fromJSON(candidate.state.doc, snapshot.selection))
          .setStoredMarks(marks)
          .setMeta('addToHistory', false))
      }
      if (!mounted || revision !== attempt) { dispose(candidate); return }
      editor.value = candidate
      groups.value = next
      saved = undefined
      problem.value = undefined
      if (snapshot?.focused) candidate.commands.focus(null, { scrollIntoView: false })
    } catch (error) {
      if (candidate) dispose(candidate)
      if (!mounted || revision !== attempt) return
      problem.value = saved ? 'This document needs an unavailable editor contribution. Restore a compatible pack to continue.'
        : 'The editor could not be loaded.'
      logger.error('Editor composition failed', { error, owners: next.map(group => `${group.packId}/${group.groupId}`) })
    }
  }

  function resetDocument() {
    saved = undefined
    void refresh(true)
  }

  onMounted(() => {
    mounted = true
    stop = tiptapPluginRegistry.onChanged(() => { void refresh() })
    void refresh()
  })
  onBeforeUnmount(() => {
    mounted = false
    revision++
    stop?.()
    if (editor.value) dispose(editor.value)
    editor.value = undefined
    groups.value = []
    saved = undefined
  })
  return { editor, groups, generation, problem, resetDocument }
}
