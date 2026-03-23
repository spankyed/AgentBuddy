import { watch, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import type { NotesState } from '../state'
import type { NoteDTO } from '@app/api'
import type TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

export function usePageInsert(
  actor: NotesState,
  editorRef: Ref<InstanceType<typeof TiptapEditor> | null>,
  editingNote: Ref<NoteDTO | null>,
) {
  const pendingPageInsert = useSelector(actor, (s) => s.context.pendingPageInsert)

  watch(
    () => pendingPageInsert.value,
    (newVal, oldVal) => {
      // When pendingPageInsert transitions from non-null to null, the child was created
      if (!oldVal || newVal) return

      const noteId = editingNote.value?.id
      const editor = editorRef.value?.editor
      if (!noteId || !editor) return

      const { notes, lastPageInsertChildId } = actor.getSnapshot().context
      if (!lastPageInsertChildId) return

      const newChild = notes.find(n => n.id === lastPageInsertChildId)
      if (!newChild) return

      editor
        .chain()
        .insertContentAt(oldVal.cursorPos, {
          type: 'subPageLink',
          attrs: { noteId: newChild.id, title: newChild.title, icon: newChild.icon },
        })
        .run()

      const content = (editor.storage as any).markdown.getMarkdown()
      actor.send({ type: 'NOTE.UPDATE_CONTENT', noteId, content })

      actor.send({ type: 'NOTE.SELECT', noteId: newChild.id })
    }
  )
}
