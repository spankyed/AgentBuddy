<template>
  <div class="rounded-lg border border-neutral-700 bg-neutral-800/40 overflow-hidden">
    <!-- Header row: chevron + icon + label + badge/spinner -->
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-700/40 transition-colors"
      @click="isOpen = !isOpen"
    >
      <ChevronRight
        class="w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform"
        :class="{ 'rotate-90': isOpen }"
      />
      <Wrench class="w-4 h-4 text-neutral-400 flex-shrink-0" />
      <span class="text-sm text-neutral-200 truncate flex-1">{{ label }}</span>
      <span v-if="state === 'streaming'" class="flex gap-1 flex-shrink-0" aria-hidden>
        <span class="w-1 h-1 rounded-full bg-neutral-500 streaming-dot" style="animation-delay: 0ms" />
        <span class="w-1 h-1 rounded-full bg-neutral-500 streaming-dot" style="animation-delay: 150ms" />
        <span class="w-1 h-1 rounded-full bg-neutral-500 streaming-dot" style="animation-delay: 300ms" />
      </span>
      <span v-else-if="badge" class="text-xs text-neutral-500 flex-shrink-0 tabular-nums">{{ badge }}</span>
    </button>

    <!-- Artifact ref link — shown below the header when set (Phase C diff) -->
    <button
      v-if="artifactRef && state !== 'streaming'"
      type="button"
      class="w-full text-left px-3 py-1.5 border-t border-neutral-800/60 text-xs text-neutral-400 hover:bg-neutral-700/30 hover:text-neutral-200 transition-colors flex items-center gap-1.5"
      @click.stop="selectArtifact"
    >
      <ArrowRight class="w-3 h-3 flex-shrink-0" />
      <span class="truncate">View changes ({{ artifactRef.label }})</span>
    </button>

    <!-- Expanded list of entries — capped height with internal scroll for long turns -->
    <div
      v-if="isOpen && entries.length > 0"
      ref="listEl"
      class="border-t border-neutral-700 max-h-80 overflow-y-auto"
      @scroll="onListScroll"
    >
      <div
        v-for="(entry, index) in entries"
        :key="entry.id || index"
        class="px-3 py-1.5 text-xs flex items-center gap-2 border-b border-neutral-800/60 last:border-0 hover:bg-neutral-800/40 cursor-default"
        :class="{
          'opacity-50 line-through': entry.status === 'denied',
        }"
        :title="entry.details?.input ? JSON.stringify(entry.details.input, null, 2) : entry.summary"
      >
        <!-- Status icon -->
        <Check v-if="entry.status === 'ok'" class="w-3 h-3 text-emerald-500 flex-shrink-0" />
        <Loader2 v-else-if="entry.status === 'running'" class="w-3 h-3 text-neutral-400 animate-spin flex-shrink-0" />
        <X v-else-if="entry.status === 'denied'" class="w-3 h-3 text-neutral-500 flex-shrink-0" />
        <AlertCircle v-else-if="entry.status === 'error'" class="w-3 h-3 text-red-500 flex-shrink-0" />

        <!-- Tool name (fixed-width column for alignment) -->
        <span class="font-mono text-neutral-300 min-w-[4.5rem] flex-shrink-0">{{ entry.tool }}</span>

        <!-- Input summary (truncated) -->
        <span class="text-neutral-400 flex-1 truncate font-mono">{{ entry.summary }}</span>

        <!-- Output summary (secondary) -->
        <span v-if="entry.outputSummary && entry.status !== 'running'" class="text-neutral-500 text-[10px] flex-shrink-0">
          {{ entry.outputSummary }}
        </span>

        <!-- Duration badge -->
        <span v-if="entry.durationMs != null" class="text-neutral-500 text-[10px] tabular-nums flex-shrink-0 min-w-[2.5rem] text-right">
          {{ formatDuration(entry.durationMs) }}
        </span>
        <span v-else-if="entry.status === 'running'" class="text-neutral-500 text-[10px] flex-shrink-0">
          running
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ChevronRight, Wrench, Check, Loader2, X, AlertCircle, ArrowRight } from 'lucide-vue-next'
import { computeLabel, computeBadge } from './tool-activity-label'
import { applicationState } from '@/main'
import { id as threadsId } from '@/plugins/threads/state'

interface ToolActivityEntry {
  id: string
  tool: string
  summary: string
  status: 'running' | 'ok' | 'denied' | 'error'
  durationMs?: number
  outputSummary?: string
  details?: { input?: unknown; output?: string; error?: string }
}

interface ArtifactRef {
  artifactId: string
  label: string
}

interface Props {
  entries: ToolActivityEntry[]
  label: string
  state: 'streaming' | 'done' | 'error'
  defaultOpen?: boolean
  artifactRef?: ArtifactRef
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
})

// User toggle wins once they interact; we only auto-open on error-state
// transitions (P3 of the design doc).
const isOpen = ref(props.defaultOpen)
const listEl = ref<HTMLElement | null>(null)
let userHasToggled = false
let userHasScrolled = false

watch(() => props.state, (next, prev) => {
  if (next === 'error' && prev !== 'error' && !userHasToggled) {
    isOpen.value = true
  }
})

// Wrap isOpen mutation so we can flag user intent.
watch(isOpen, () => { userHasToggled = true })

// Auto-scroll to the bottom as new rows stream in, so the latest tool
// stays visible in the capped viewport. Stop tracking once the user
// manually scrolls — then they're in charge of the scroll position.
watch(
  () => props.entries.length,
  async () => {
    if (!isOpen.value || props.state !== 'streaming' || userHasScrolled) return
    await nextTick()
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

function onListScroll(e: Event) {
  const el = e.target as HTMLElement
  // Detect user-initiated scrolls by checking if they're not at the bottom.
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  if (!atBottom) userHasScrolled = true
  else userHasScrolled = false // resume auto-tracking if they scroll back down
}

// Re-compute the label from entries/state on every update so we stay
// honest even if the backend writer lags. The backend-provided `label`
// from props is the source of truth; we only override if it's missing.
const label = computed(() => props.label || computeLabel(props.entries, props.state))

const badge = computed(() => computeBadge(props.entries, props.state))

const entries = computed(() => props.entries)
const state = computed(() => props.state)
const artifactRef = computed(() => props.artifactRef)

// Jump to the referenced artifact in the right panel when the link is clicked.
function selectArtifact() {
  if (!props.artifactRef) return
  const threadsActor = applicationState.system.get(threadsId)
  threadsActor.send({ type: 'SELECT_ARTIFACT', artifactId: props.artifactRef.artifactId })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.round((ms % 60_000) / 1000)
  return `${mins}m${secs}s`
}
</script>

<style scoped>
.streaming-dot {
  animation: streaming-pulse 1.2s ease-in-out infinite;
}
@keyframes streaming-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
