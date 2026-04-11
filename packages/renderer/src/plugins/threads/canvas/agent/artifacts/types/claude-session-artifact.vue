<template>
  <div class="max-w-2xl">
    <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <Wrench :size="14" class="text-neutral-400" />
        <h3 class="text-sm font-medium text-neutral-200 flex-1">Claude Code session</h3>
        <span class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            :class="statusDotClass"
            :title="content.status"
          />
          <span class="text-xs text-neutral-400 capitalize">{{ statusLabel }}</span>
        </span>
      </div>

      <!-- Key/value grid -->
      <div class="px-3 py-3 space-y-2 text-xs">
        <div class="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2">
          <span class="text-neutral-500">Model</span>
          <span class="text-neutral-200 font-mono truncate">{{ content.model || '—' }}</span>

          <span class="text-neutral-500">Session</span>
          <div class="flex items-center gap-2">
            <span class="text-neutral-200 font-mono truncate flex-1">
              {{ truncatedSessionId || '—' }}
            </span>
            <button
              v-if="content.sessionId"
              @click="copySessionId"
              class="text-neutral-500 hover:text-neutral-300 transition-colors"
              :title="copied ? 'Copied!' : 'Copy session id'"
            >
              <Check v-if="copied" :size="12" class="text-green-500" />
              <Copy v-else :size="12" />
            </button>
          </div>

          <span class="text-neutral-500">CWD</span>
          <span class="text-neutral-200 font-mono truncate" :title="content.cwd">
            {{ shortenCwd(content.cwd) || '—' }}
          </span>

          <span class="text-neutral-500">Turns</span>
          <span class="text-neutral-200 tabular-nums">{{ content.turns ?? 0 }}</span>

          <span class="text-neutral-500">Tools</span>
          <span class="text-neutral-200 tabular-nums">{{ content.toolCallCount ?? 0 }}</span>

          <span class="text-neutral-500">Cost</span>
          <span class="text-neutral-200 tabular-nums">${{ (content.totalCostUsd ?? 0).toFixed(3) }}</span>
        </div>

        <!-- Last tool (only when present) -->
        <div v-if="content.lastTool" class="pt-2 mt-2 border-t border-neutral-800 text-neutral-500">
          <span class="text-[10px] uppercase tracking-wide">Last</span>
          <div class="text-neutral-300 truncate mt-0.5">
            <span class="font-mono">{{ content.lastTool.name }}</span>
            <span v-if="content.lastTool.summary" class="text-neutral-500"> · {{ content.lastTool.summary }}</span>
            <span class="text-neutral-600"> · {{ relativeTime(content.lastTool.at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Wrench, Copy, Check } from 'lucide-vue-next'
import type { ArtifactItem } from '@app/api'

interface SessionContent {
  sessionId: string
  model: string
  cwd: string
  startedAt: number
  lastTurnAt: number
  turns: number
  totalCostUsd: number
  status: 'idle' | 'streaming' | 'awaiting-permission' | 'ended'
  toolCallCount: number
  lastTool?: { name: string; summary: string; at: number }
}

const props = defineProps<{
  artifact: ArtifactItem & { content: SessionContent }
}>()

const content = computed(() => props.artifact.content)

const statusDotClass = computed(() => {
  switch (content.value.status) {
    case 'streaming': return 'bg-green-500 animate-pulse'
    case 'awaiting-permission': return 'bg-yellow-500 animate-pulse'
    case 'idle': return 'bg-neutral-500'
    case 'ended': return 'bg-neutral-700'
    default: return 'bg-neutral-500'
  }
})

const statusLabel = computed(() => {
  switch (content.value.status) {
    case 'awaiting-permission': return 'Awaiting approval'
    default: return content.value.status
  }
})

const truncatedSessionId = computed(() => {
  const id = content.value.sessionId
  if (!id) return ''
  if (id.length <= 18) return id
  return `${id.slice(0, 8)}…${id.slice(-6)}`
})

function shortenCwd(cwd: string): string {
  if (!cwd) return ''
  // Show at most the last 3 path segments so the card stays compact.
  const segments = cwd.split('/').filter(Boolean)
  if (segments.length <= 3) return cwd
  return `…/${segments.slice(-3).join('/')}`
}

function relativeTime(epochMs: number): string {
  const delta = Date.now() - epochMs
  if (delta < 5_000) return 'just now'
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  return `${Math.round(delta / 3_600_000)}h ago`
}

const copied = ref(false)
async function copySessionId() {
  try {
    await navigator.clipboard.writeText(content.value.sessionId)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // clipboard denied — silently no-op
  }
}
</script>
