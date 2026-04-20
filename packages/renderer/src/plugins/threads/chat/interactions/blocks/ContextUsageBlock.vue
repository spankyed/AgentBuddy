<template>
  <div class="rounded-md bg-neutral-850 border border-neutral-800 animate-fade-in max-w-lg">
    <!-- Header: model + usage summary -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
      <span class="text-xs text-neutral-400 font-mono truncate">{{ data.model || '—' }}</span>
      <span class="text-xs tabular-nums" :class="usageColor">
        {{ fmt(data.totalTokens) }} / {{ fmt(data.maxTokens) }}
        <span class="text-neutral-500 ml-1">({{ data.percentage }}%)</span>
      </span>
    </div>

    <!-- Usage bar -->
    <div class="h-1.5 bg-neutral-800">
      <div
        class="h-full transition-all duration-300"
        :class="barColor"
        :style="{ width: `${Math.min(data.percentage, 100)}%` }"
      />
    </div>

    <!-- Categories -->
    <div class="px-3 py-2.5 space-y-1.5">
      <div
        v-for="cat in visibleCategories"
        :key="cat.name"
        class="flex items-center gap-2 text-xs"
      >
        <span class="w-24 text-neutral-500 truncate shrink-0">{{ cat.name }}</span>
        <div class="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full"
            :class="getCategoryColor(cat.name)"
            :style="{ width: barWidth(cat.percentage) }"
          />
        </div>
        <span class="w-14 text-right tabular-nums text-neutral-400 shrink-0">{{ fmt(cat.tokens) }}</span>
        <span class="w-10 text-right tabular-nums text-neutral-600 shrink-0">{{ cat.percentage.toFixed(1) }}%</span>
      </div>
    </div>

    <!-- Memory Files -->
    <details v-if="data.memoryFiles?.length" class="border-t border-neutral-800">
      <summary class="px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 cursor-pointer select-none hover:text-neutral-400">
        Memory Files
      </summary>
      <div class="px-3 pb-2 space-y-0.5">
        <div v-for="f in data.memoryFiles" :key="f.path" class="flex items-center gap-2 text-xs">
          <span class="text-neutral-500 shrink-0">{{ f.type }}</span>
          <span class="text-neutral-300 font-mono truncate flex-1" :title="f.path">{{ shortenPath(f.path) }}</span>
          <span class="text-neutral-500 tabular-nums shrink-0">{{ fmt(f.tokens) }}</span>
        </div>
      </div>
    </details>

    <!-- Skills -->
    <details v-if="data.skills?.length" class="border-t border-neutral-800">
      <summary class="px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 cursor-pointer select-none hover:text-neutral-400">
        Skills
      </summary>
      <div class="px-3 pb-2 space-y-0.5">
        <div v-for="s in data.skills" :key="s.name" class="flex items-center gap-2 text-xs">
          <span class="text-neutral-300 truncate flex-1">{{ s.name }}</span>
          <span class="text-neutral-500 tabular-nums shrink-0">{{ fmt(s.tokens) }}</span>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ContextCategory {
  name: string
  tokens: number
  percentage: number
}

interface ContextUsageData {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  categories: ContextCategory[]
  memoryFiles?: Array<{ type: string; path: string; tokens: number }>
  skills?: Array<{ name: string; source: string; tokens: number }>
}

const props = defineProps<{ data: ContextUsageData }>()

// Filter out "Free space" and "Autocompact buffer" from the bar list
const visibleCategories = computed(() =>
  props.data.categories.filter(c => c.name !== 'Free space' && c.name !== 'Autocompact buffer')
)

const usageColor = computed(() => {
  const p = props.data.percentage
  if (p >= 90) return 'text-red-400'
  if (p >= 75) return 'text-yellow-400'
  return 'text-neutral-200'
})

const barColor = computed(() => {
  const p = props.data.percentage
  if (p >= 90) return 'bg-red-500'
  if (p >= 75) return 'bg-yellow-500'
  return 'bg-purple-500'
})

const CATEGORY_COLORS: Record<string, string> = {
  'System prompt': 'bg-neutral-500',
  'System tools': 'bg-blue-500',
  'MCP tools': 'bg-cyan-500',
  'Memory files': 'bg-orange-500',
  'Skills': 'bg-yellow-500',
  'Messages': 'bg-purple-500',
  'Custom Agents': 'bg-emerald-500',
}

function getCategoryColor(name: string): string {
  return CATEGORY_COLORS[name] ?? 'bg-neutral-500'
}

function barWidth(pct: number): string {
  // Ensure tiny categories still show a visible sliver
  if (pct <= 0) return '0%'
  return `${Math.max(pct, 0.5)}%`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function shortenPath(path: string): string {
  if (!path) return ''
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 3) return path
  return `…/${segments.slice(-3).join('/')}`
}
</script>
