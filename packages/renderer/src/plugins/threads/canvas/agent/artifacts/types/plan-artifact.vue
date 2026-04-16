<template>
  <div class="max-w-3xl h-full flex flex-col min-h-0">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in flex flex-col min-h-0 flex-1">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div class="flex items-center gap-2">
          <ClipboardList :size="14" class="text-neutral-400" />
          <h3 class="text-sm font-medium text-neutral-200">
            {{ artifact.title || 'Plan' }}
          </h3>
          <span v-if="branch" class="text-xs text-neutral-500 font-mono">{{ branch }}</span>
          <span v-if="prNumber" class="text-xs text-neutral-500">#{{ prNumber }}</span>
        </div>
        <!--
          Status pill — backend round-trips this via the chat-thread
          approval block (see createPlanDraft / resolvePlanDraft in
          packages/default-setup/src/actions/claude-code/_helpers/plan-artifact.ts).
          The artifact card used to also carry local Approve/Reject
          buttons that mutated state without hitting the backend;
          those were dead UI in the ExitPlanMode flow (the real
          approval goes through the chat approval block, not these
          buttons) and only caused confusion, so they were removed.
          The pill now passively reflects whatever the backend says.
        -->
        <span
          class="text-xs px-2 py-0.5 rounded"
          :class="statusPillClass"
        >
          {{ statusLabel }}
        </span>
      </div>

      <!-- Markdown notes body — scrollable for long plans -->
      <div class="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
        <TiptapEditor
          v-if="notes"
          mode="viewer"
          variant="chat"
          :model-value="notes"
        />
        <p v-else class="text-xs text-neutral-500 italic">
          This plan has no notes yet.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ClipboardList } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import TiptapEditor from '@/core/components/tiptap/TiptapEditor.vue'

type PlanStatus = 'draft' | 'approved' | 'in-progress' | 'completed' | 'rejected'

interface PlanContent {
  notes: string
  status: PlanStatus
  steps: Array<{ id: string; title: string; description?: string; status: string }>
}

const props = defineProps<{
  artifact: ArtifactItem & { content: PlanContent }
}>()

// Read status directly from the artifact content. Previously this was
// mirrored into a local ref so Approve/Reject clicks could feel instant,
// but those local buttons were removed — the real approval flow now
// round-trips through the chat approval block and the backend pushes
// status updates via services.artifact.updateAndNotify, which hydrates
// the prop directly. No local state needed.
const status = computed<PlanStatus>(() => props.artifact.content?.status ?? 'draft')

const notes = computed(() => props.artifact.content?.notes ?? '')
const branch = computed(() => props.artifact.content?.branch ?? '')
const prNumber = computed(() => props.artifact.content?.prNumber ?? '')

const statusLabel = computed(() => {
  switch (status.value) {
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'in-progress': return 'In progress'
    case 'completed': return 'Completed'
    case 'draft': return 'Draft'
    default: return status.value
  }
})

const statusPillClass = computed(() => {
  switch (status.value) {
    case 'approved':
    case 'completed':
      return 'bg-green-500/10 text-green-400'
    case 'rejected':
      return 'bg-red-500/10 text-red-400'
    case 'in-progress':
      return 'bg-blue-500/10 text-blue-400'
    default:
      return 'bg-neutral-500/10 text-neutral-400'
  }
})
</script>
