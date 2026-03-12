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
        />
      </div>

      <!-- Editor -->
      <div class="flex-1 overflow-y-auto px-2">
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
import { ref, watch, provide, nextTick } from 'vue'
import { useSelector } from '@xstate/vue'
import { id, type NotesState } from './state'
import { applicationState } from '@/main'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import { EXTRA_BLOCK_ITEMS_KEY, type BlockItem } from '@/core/components/tiptap/injection-keys'
import { NotebookText, FileText } from 'lucide-vue-next'
import EmojiPicker from '@/core/components/design/EmojiPicker.vue'

const actor: NotesState = applicationState.system.get(id)
const state = useSelector(actor, (s) => s)
const currentNote = useSelector(actor, (s) => s.context.currentNote)
const notes = useSelector(actor, (s) => s.context.notes)
const pendingPageInsert = useSelector(actor, (s) => s.context.pendingPageInsert)

const editorRef = ref<InstanceType<typeof TiptapEditor> | null>(null)
const titleRef = ref<HTMLInputElement | null>(null)

let contentDebounceTimer: ReturnType<typeof setTimeout> | null = null
let titleDebounceTimer: ReturnType<typeof setTimeout> | null = null

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

// Focus editor when navigating into a different note
watch(currentNote, (note, oldNote) => {
  if (note && note.id !== oldNote?.id) {
    nextTick(() => editorRef.value?.editor?.commands.focus())
  }
})

// Watch for pending page insert completion (new child note created)
watch(
  () => pendingPageInsert.value,
  (newVal, oldVal) => {
    // When pendingPageInsert transitions from non-null to null, the child was created
    if (oldVal && !newVal) {
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
  }
)

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
  const noteId = currentNote.value.id
  if (contentDebounceTimer) clearTimeout(contentDebounceTimer)
  contentDebounceTimer = setTimeout(() => {
    actor.send({ type: 'NOTE.UPDATE_CONTENT', noteId, content })
  }, 500)
}

function handleTitleInput(event: Event) {
  const title = (event.target as HTMLInputElement).value
  if (!currentNote.value) return
  const noteId = currentNote.value.id
  if (titleDebounceTimer) clearTimeout(titleDebounceTimer)
  titleDebounceTimer = setTimeout(() => {
    actor.send({ type: 'NOTE.UPDATE_TITLE', noteId, title })
  }, 500)
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

function handleTitleEnter() {
  const editor = editorRef.value?.editor
  if (!editor) return

  const firstNode = editor.state.doc.firstChild
  if (firstNode?.type.name === 'subPageLink') {
    editor.chain().insertContentAt(0, { type: 'paragraph' }).focus('start').run()
  } else {
    editor.commands.focus()
  }
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
