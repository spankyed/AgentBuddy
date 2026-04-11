<template>
  <div class="max-w-3xl">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div class="flex items-center gap-2">
          <ClipboardList :size="14" class="text-neutral-400" />
          <h3 class="text-sm font-medium text-neutral-200">
            {{ artifact.title || 'Plan' }}
          </h3>
        </div>
        <!-- Approve/Reject buttons while status is draft; otherwise show final pill -->
        <div v-if="status === 'draft'" class="flex gap-2">
          <button
            type="button"
            @click="handleReject"
            class="px-3 py-1 text-xs font-medium text-red-400 transition-colors border rounded bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
          >
            Reject
          </button>
          <button
            type="button"
            @click="handleApprove"
            class="px-3 py-1 text-xs font-medium text-green-400 transition-colors border rounded bg-green-500/10 border-green-500/20 hover:bg-green-500/15"
          >
            Approve
          </button>
        </div>
        <span
          v-else
          class="text-xs px-2 py-0.5 rounded"
          :class="statusPillClass"
        >
          {{ statusLabel }}
        </span>
      </div>

      <!-- Markdown notes body -->
      <div class="px-4 py-3">
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
import { computed, ref, watch } from 'vue'
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

// Local mirror of the status so Approve/Reject clicks feel instant.
// The backend doesn't yet round-trip these mutations; that's the job of
// Phase D-full. For the stub, local state is enough to demonstrate UX.
const status = ref<PlanStatus>(props.artifact.content?.status ?? 'draft')

// Keep status in sync with props in case the backend ever pushes an update.
watch(
  () => props.artifact.content?.status,
  (next) => { if (next) status.value = next },
)

const notes = computed(() => props.artifact.content?.notes ?? '')

const statusLabel = computed(() => {
  switch (status.value) {
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'in-progress': return 'In progress'
    case 'completed': return 'Completed'
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

function handleApprove() {
  status.value = 'approved'
}

function handleReject() {
  status.value = 'rejected'
}
</script>
