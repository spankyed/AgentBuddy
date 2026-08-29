<template>
  <div class="max-w-3xl h-full flex flex-col min-h-20">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in flex flex-col min-h-0 flex-1">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div class="flex items-center gap-2">
          <StickyNote :size="14" class="text-neutral-400" />
          <h3 class="text-sm font-medium text-neutral-200">
            {{ note?.title || artifact.title || 'Note' }}
          </h3>
        </div>
        <CopyButton :text="noteContent" />
      </div>

      <!-- Note body -->
      <div class="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
        <TiptapEditor
          v-if="noteContent"
          mode="viewer"
          variant="chat"
          :model-value="noteContent"
        />
        <p v-else class="text-xs text-neutral-500 italic">
          Note not found.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { StickyNote } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'
import CopyButton from '@/core/components/design/CopyButton.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'

const props = defineProps<{
  artifact: ArtifactItem
}>()

// The artifact content is a noteId string — look up the note from the notes system
const noteId = computed(() =>
  typeof props.artifact.content === 'string'
    ? props.artifact.content
    : props.artifact.content?.noteId ?? ''
)

const notesActor = applicationState.system.get('notes')
const allNotes = useSelector(notesActor, (s: any) => s.context.notes ?? [])

const note = computed(() =>
  allNotes.value.find((n: any) => n.id === noteId.value)
)

const noteContent = computed(() => note.value?.content ?? '')
</script>
