import { watch, nextTick, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import type { NotesState } from '../state'
import type TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

export function useNoteFocus(
  actor: NotesState,
  titleRef: Ref<HTMLInputElement | null>,
  editorRef: Ref<InstanceType<typeof TiptapEditor> | null>,
) {
  const currentNote = useSelector(actor, (s) => s.context.currentNote)
  const selectedTask = useSelector(actor, (s) => s.context.selectedTask)

  watch(currentNote, (note, oldNote) => {
    if (!note || note.id === oldNote?.id) return
    const isNewNote = note.title === 'Untitled' && !note.content
    nextTick(() => {
      if (isNewNote) {
        titleRef.value?.focus()
        titleRef.value?.select()
      } else {
        editorRef.value?.editor?.commands.focus('start')
      }
    })
  })

  watch(selectedTask, (task, oldTask) => {
    if (!task || task.id === oldTask?.id) return
    const isNewTask = task.title === 'Untitled' && !task.content
    if (isNewTask) {
      nextTick(() => {
        titleRef.value?.focus()
        titleRef.value?.select()
      })
    }
  })
}
