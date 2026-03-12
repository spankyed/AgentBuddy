import { watch, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import type { NotesState } from '../state'
import type { NoteDTO } from '@app/api'
import type TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

export function usePageInsert(
  actor: NotesState,
  editorRef: Ref<InstanceType<typeof TiptapEditor> | null>,
  currentNote: Ref<NoteDTO | null>,
) {
  const pendingPageInsert = useSelector(actor, (s) => s.context.pendingPageInsert)

  watch(
    () => pendingPageInsert.value,
    (newVal, oldVal) => {
      // When pendingPageInsert transitions from non-null to null, the child was created
      if (!oldVal || newVal) return

      const notes = actor.getSnapshot().context.notes
      const noteId = currentNote.value?.id
      if (!noteId) return

      // Find the most recently created child note
      const children = notes
        .filter(n => n.parentId === noteId)
        .sort((a, b) => b.createdAt - a.createdAt)
      const newChild = children[0]
      if (!newChild) return

      // Insert the link at the saved cursor position
      const editor = editorRef.value?.editor
      if (editor) {
        editor
          .chain()
          .focus()
          .insertContentAt(oldVal.cursorPos, {
            type: 'subPageLink',
            attrs: { noteId: newChild.id, title: newChild.title, icon: newChild.icon },
          })
          .run()

        // Save parent content immediately (bypass debounce), then navigate to new child
        const content = (editor.storage as any).markdown.getMarkdown()
        actor.send({ type: 'NOTE.UPDATE_CONTENT', noteId, content })

        // Auto-expand parent in tree so child is visible
        const snapshot = actor.getSnapshot()
        if (!snapshot.context.expandedNodeIds.includes(noteId)) {
          actor.send({ type: 'NOTE.TOGGLE_EXPAND', nodeId: noteId })
        }

        // Navigate to the new child note
        actor.send({ type: 'NOTE.SELECT', noteId: newChild.id })
      }
    }
  )
}
