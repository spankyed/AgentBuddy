<template>
  <div class="rounded-lg bg-neutral-850 border border-neutral-800 animate-fade-in min-w-[480px]">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
      <span class="text-xs text-neutral-400">Sessions</span>
      <span class="text-xs tabular-nums text-neutral-500">{{ sessions.length }}</span>
    </div>

    <!-- Session list -->
    <div class="max-h-[400px] overflow-y-auto">
      <div
        v-for="s in sessions"
        :key="s.id"
        class="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800/50 last:border-b-0 hover:bg-neutral-800/30 transition-colors group"
      >
        <!-- Truncated ID -->
        <span class="text-[11px] font-mono text-neutral-500 shrink-0 w-16">{{ s.id.slice(0, 8) }}</span>

        <!-- Title -->
        <span class="text-xs truncate flex-1" :class="s.title === '(untitled)' ? 'text-neutral-500 italic' : 'text-neutral-200'">
          {{ s.title }}
        </span>

        <!-- Size -->
        <span v-if="s.size" class="text-[10px] text-neutral-600 tabular-nums shrink-0">{{ formatSize(s.size) }}</span>

        <!-- Date -->
        <span class="text-[11px] text-neutral-500 tabular-nums shrink-0 w-16 text-right">{{ formatDate(s.modifiedAt) }}</span>

        <!-- Copy button -->
        <button
          @click="copy(s.id)"
          class="p-1 text-neutral-600 hover:text-neutral-300 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
          :title="copied === s.id ? 'Copied!' : 'Copy session ID'"
        >
          <Check v-if="copied === s.id" :size="12" class="text-green-500" />
          <Copy v-else :size="12" />
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!sessions.length" class="px-4 py-6 text-center text-xs text-neutral-500">
        No sessions found.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check } from 'lucide-vue-next'

interface SessionItem {
  id: string
  title: string
  modifiedAt: string
  size: number
}

defineProps<{ sessions: SessionItem[] }>()

const copied = ref<string | null>(null)

async function copy(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    copied.value = id
    setTimeout(() => { copied.value = null }, 1500)
  } catch { /* clipboard denied */ }
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const delta = now - d.getTime()
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
</script>
