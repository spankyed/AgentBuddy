<template>
  <div class="flex flex-col h-full">
    <!-- Welcome State -->
    <div
      v-if="state.hasTag('welcome')"
      class="flex flex-col items-center justify-center h-full gap-4 text-neutral-400"
    >
      <NotebookText :size="48" class="text-neutral-600" />
      <p class="text-lg">Create your first note</p>
      <button
        class="px-4 py-2 text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors"
        @click="handleCreateNote()"
      >
        New Note
      </button>
    </div>

    <!-- Editor State -->
    <div
      v-else-if="state.hasTag('editor') && currentNote"
      class="flex flex-col h-full"
    >
      <!-- Title row -->
      <div class="flex items-center gap-1 px-4 py-3">
        <EmojiPicker :model-value="currentNote.icon" @update:model-value="handleIconUpdate">
          <template #default="{ toggle }">
            <button
              class="flex items-center justify-center w-8 h-8 rounded hover:bg-neutral-800 transition-colors shrink-0"
              @click="toggle"
            >
              <span v-if="currentNote.icon" class="text-xl leading-none">{{ currentNote.icon }}</span>
              <FileText v-else :size="20" class="text-neutral-500" />
            </button>
          </template>
        </EmojiPicker>
        <input
          ref="titleRef"
          :value="currentNote.title"
          class="w-full text-2xl font-bold bg-transparent text-neutral-100 border-none outline-none placeholder-neutral-600"
          placeholder="Untitled"
          @input="handleTitleInput"
          @keydown.enter.prevent="handleTitleEnter"
          @keydown.down.prevent="editorRef?.editor?.commands.focus('start')"
          @keydown.right="handleTitleRight"
        />
      </div>

      <!-- Editor -->
      <div class="flex-1 overflow-y-auto pl-1 pr-4">
        <TiptapEditor
          ref="editorRef"
          mode="editor"
          :model-value="currentNote.content"
          :entity-id="currentNote.id"
          placeholder="Start writing..."
          class="h-full"
          @update:model-value="handleContentUpdate"
          @note-link-click="handleNoteLinkClick"
          @sub-page-link-deleted="handleSubPageLinkDeleted"
          @sub-page-link-restored="handleSubPageLinkRestored"
          @focus-title="focusTitleEnd()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, provide } from 'vue'
import { useSelector } from '@xstate/vue'
import { id, type NotesState } from './state'
import { applicationState } from '@/main'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import { EXTRA_BLOCK_ITEMS_KEY, type BlockItem } from '@/core/components/tiptap/injection-keys'
import { NotebookText, FileText } from 'lucide-vue-next'
import EmojiPicker from '@/core/components/design/EmojiPicker.vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { useNoteFocus } from './composables/useNoteFocus'
import { usePageInsert } from './composables/usePageInsert'

const actor: NotesState = applicationState.system.get(id)
const state = useSelector(actor, (s) => s)
const currentNote = useSelector(actor, (s) => s.context.currentNote)
const notes = useSelector(actor, (s) => s.context.notes)

const editorRef = ref<InstanceType<typeof TiptapEditor> | null>(null)
const titleRef = ref<HTMLInputElement | null>(null)

// Composables
useNoteFocus(actor, titleRef, editorRef)
usePageInsert(actor, editorRef, currentNote)

// Debounced handlers
const SAVE_DEBOUNCE_MS = 150
const { debounced: debouncedUpdateContent } = useDebounce((noteId: string, content: string) => {
  actor.send({ type: 'NOTE.UPDATE_CONTENT', noteId, content })
}, SAVE_DEBOUNCE_MS)
const { debounced: debouncedUpdateTitle } = useDebounce((noteId: string, title: string) => {
  actor.send({ type: 'NOTE.UPDATE_TITLE', noteId, title })
}, SAVE_DEBOUNCE_MS)

// Provide extra block items for the "Page" action
const pageBlockItem: BlockItem[] = [
  {
    label: 'Page',
    icon: FileText,
    command: (editor) => {
      const noteId = currentNote.value?.id
      if (!noteId) return
      const cursorPos = editor.state.selection.from
      actor.send({ type: 'NOTE.REQUEST_PAGE_INSERT', parentId: noteId, cursorPos })
    },
  },
]
provide(EXTRA_BLOCK_ITEMS_KEY, pageBlockItem)

function focusTitleEnd() {
  const el = titleRef.value
  if (!el) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

function handleCreateNote(parentId?: string) {
  actor.send({ type: 'NOTE.CREATE', parentId })
}

function handleContentUpdate(content: string) {
  if (!currentNote.value) return
  debouncedUpdateContent(currentNote.value.id, content)
}

function handleTitleInput(event: Event) {
  const title = (event.target as HTMLInputElement).value
  if (!currentNote.value) return
  debouncedUpdateTitle(currentNote.value.id, title)
}

function handleNoteLinkClick(noteId: string) {
  actor.send({ type: 'NOTE.LINK_CLICKED', noteId })
}

function handleSubPageLinkDeleted(noteId: string) {
  actor.send({ type: 'NOTE.SOFT_DELETE', noteId })
}

function handleSubPageLinkRestored(noteId: string) {
  actor.send({ type: 'NOTE.RESTORE', noteId })
}

function handleTitleRight(event: KeyboardEvent) {
  const el = event.target as HTMLInputElement
  if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
    event.preventDefault()
    editorRef.value?.editor?.commands.focus('start')
  }
}

function handleTitleEnter() {
  const editor = editorRef.value?.editor
  if (!editor) return
  editor.commands.focus('start')
}

function handleIconUpdate(icon: string | null) {
  if (!currentNote.value) return
  actor.send({ type: 'NOTE.UPDATE_ICON', noteId: currentNote.value.id, icon })
}

// Sync sub-page link node attrs (title/icon) when child notes change
watch(
  notes,
  (allNotes) => {
    const editor = editorRef.value?.editor
    if (!editor || !currentNote.value) return

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'subPageLink' && node.attrs.noteId) {
        const child = allNotes.find(n => n.id === node.attrs.noteId)
        if (child && (node.attrs.title !== child.title || node.attrs.icon !== child.icon)) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              title: child.title,
              icon: child.icon,
            })
          )
        }
      }
    })
  },
  { deep: true }
)
</script>
