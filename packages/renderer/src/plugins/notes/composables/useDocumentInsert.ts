import { watch, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import type { NotesState } from '../state'
import type { NoteDTO } from '@app/api'
import type TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

export function useDocumentInsert(
  actor: NotesState,
  editorRef: Ref<InstanceType<typeof TiptapEditor> | null>,
  editingNote: Ref<NoteDTO | null>,
) {
  const pendingDocumentInsert = useSelector(actor, (s) => s.context.pendingDocumentInsert)

  watch(
    () => pendingDocumentInsert.value,
    (newVal, oldVal) => {
      // When pendingDocumentInsert transitions from non-null to null, the child was created
      if (!oldVal || newVal) return

      const noteId = editingNote.value?.id
      const editor = editorRef.value?.editor
      if (!noteId || !editor) return

      const { notes, lastDocumentInsertChildId } = actor.getSnapshot().context
      if (!lastDocumentInsertChildId) return

      const newChild = notes.find(n => n.id === lastDocumentInsertChildId)
      if (!newChild) return

      editor
        .chain()
        .insertContentAt(oldVal.cursorPos, {
          type: 'subDocumentLink',
          attrs: { noteId: newChild.id, title: newChild.title, icon: newChild.icon },
        })
        .run()

      const content = (editor.storage as any).markdown.getMarkdown()
      actor.send({ type: 'NOTE.UPDATE_CONTENT', noteId, content })

      actor.send({ type: 'NOTE.SELECT', noteId: newChild.id })
    }
  )
}
