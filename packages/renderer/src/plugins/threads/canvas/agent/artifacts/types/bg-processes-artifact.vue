<template>
  <div class="max-w-2xl">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <Terminal :size="14" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200 flex-1">Background Processes</h3>
        <span v-if="runningCount > 0" class="text-xs text-green-400 tabular-nums">
          {{ runningCount }} running
        </span>
      </div>

      <!-- Process list -->
      <div class="divide-y divide-neutral-800">
        <div
          v-for="proc in sortedProcesses"
          :key="proc.toolUseId"
          class="px-3 py-2.5"
        >
          <!-- Row 1: status + command + duration -->
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="statusDotClass(proc.status)"
              :title="proc.status"
            />
            <span
              class="text-sm text-neutral-200 font-mono truncate flex-1"
              :title="proc.command"
            >
              {{ proc.commandSummary }}
            </span>
            <span class="text-xs text-neutral-500 tabular-nums flex-shrink-0">
              {{ formatDuration(proc) }}
            </span>
          </div>

          <!-- Row 2: details -->
          <div class="ml-4 mt-1 flex items-center gap-2 flex-wrap">
            <span
              v-if="proc.autoReleased"
              class="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400"
            >
              auto-released
            </span>
            <span
              v-if="proc.outputSummary"
              class="text-xs text-neutral-500 truncate"
              :title="proc.outputSummary"
            >
              {{ proc.outputSummary }}
            </span>
          </div>

          <!-- Row 3: actions -->
          <div class="ml-4 mt-1.5 flex gap-2">
            <button
              v-if="proc.status === 'running'"
              @click="stopProcess(proc)"
              class="text-[11px] px-2 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-800 transition-colors"
            >
              Stop
            </button>
            <button
              v-if="proc.status === 'completed' || proc.status === 'failed'"
              @click="rerunProcess(proc)"
              class="text-[11px] px-2 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:text-blue-400 hover:border-blue-800 transition-colors"
            >
              Rerun
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="processes.length === 0"
          class="px-3 py-6 text-center text-xs text-neutral-600"
        >
          No background processes
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSelector } from '@xstate/vue'
import { Terminal } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'
import { applicationState } from '@/main'
import { id as threadsId } from '@/plugins/threads/state'

interface BgProcessEntry {
  toolUseId: string
  backgroundTaskId?: string
  command: string
  commandSummary: string
  status: 'running' | 'completed' | 'failed' | 'unknown'
  startedAt: number
  completedAt?: number
  durationMs?: number
  outputSummary?: string
  autoReleased?: boolean
}

interface BgProcessesContent {
  processes: BgProcessEntry[]
}

const props = defineProps<{
  artifact: ArtifactItem & { content: BgProcessesContent }
}>()

const threadsActor = applicationState.system.get(threadsId)
const currentThreadId = useSelector(
  threadsActor,
  (state: any) => state.context.currentThread?.id as string | undefined,
)

const processes = computed(() => props.artifact.content?.processes ?? [])

const runningCount = computed(
  () => processes.value.filter(p => p.status === 'running').length,
)

// Sort: running first, then by startedAt descending.
const sortedProcesses = computed(() => {
  const sorted = [...processes.value]
  sorted.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (a.status !== 'running' && b.status === 'running') return 1
    return b.startedAt - a.startedAt
  })
  return sorted
})

// Live-update durations for running processes.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function formatDuration(proc: BgProcessEntry): string {
  let ms: number
  if (proc.status === 'running') {
    // Live duration from startedAt.
    ms = now.value - proc.startedAt
  } else if (proc.durationMs != null) {
    ms = proc.durationMs
  } else if (proc.completedAt) {
    ms = proc.completedAt - proc.startedAt
  } else {
    return '—'
  }
  if (ms < 1000) return '<1s'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'running': return 'bg-green-500 animate-pulse'
    case 'completed': return 'bg-neutral-500'
    case 'failed': return 'bg-red-500'
    default: return 'bg-yellow-500'
  }
}

function stopProcess(proc: BgProcessEntry) {
  if (!currentThreadId.value) return
  threadsActor.send({
    type: 'SEND_MESSAGE',
    text: `Stop the background process running \`${proc.commandSummary}\`. Use TaskStop or Bash to kill it.`,
    references: {},
  })
}

function rerunProcess(proc: BgProcessEntry) {
  if (!currentThreadId.value) return
  threadsActor.send({
    type: 'SEND_MESSAGE',
    text: `Run this command in the background: \`${proc.command}\``,
    references: {},
  })
}
</script>
