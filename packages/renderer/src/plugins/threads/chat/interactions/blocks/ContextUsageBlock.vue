<template>
  <div class="rounded-lg bg-neutral-850 border border-neutral-800 animate-fade-in min-w-[480px]">
    <!-- Header -->
    <div class="px-4 pt-4 pb-3">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-xs text-neutral-500 font-mono">{{ data.model || '—' }}</span>
        <span class="text-xs tabular-nums" :class="usageColor">{{ data.percentage }}%</span>
      </div>

      <!-- Overall usage bar — stacked segments per category -->
      <div class="h-2 bg-neutral-800 rounded-full overflow-hidden flex">
        <div
          v-for="cat in visibleCategories"
          :key="'bar-' + cat.name"
          class="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
          :class="getCategoryColor(cat.name)"
          :style="{ width: `${cat.percentage}%` }"
        />
      </div>
      <div class="flex justify-between mt-1.5 text-[11px] tabular-nums text-neutral-500">
        <span>{{ fmt(data.totalTokens) }} used</span>
        <span>{{ fmt(data.maxTokens) }} limit</span>
      </div>
    </div>

    <!-- Category breakdown -->
    <div class="px-4 pb-4 pt-1">
      <p class="text-[10px] uppercase tracking-wide text-neutral-500 mb-2.5">Breakdown</p>
      <div class="space-y-2.5">
        <div
          v-for="cat in visibleCategories"
          :key="cat.name"
          class="space-y-1"
        >
          <div class="flex items-baseline justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-sm shrink-0" :class="getCategoryColor(cat.name)" />
              <span class="text-xs text-neutral-300">{{ cat.name }}</span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="text-xs tabular-nums text-neutral-400">{{ fmt(cat.tokens) }}</span>
              <span class="text-[11px] tabular-nums text-neutral-600 w-10 text-right">{{ cat.percentage.toFixed(1) }}%</span>
            </div>
          </div>
          <div class="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="getCategoryColor(cat.name)"
              :style="{ width: barWidth(cat.percentage) }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Memory Files -->
    <details v-if="data.memoryFiles?.length" class="border-t border-neutral-800 group">
      <summary class="px-4 py-2.5 text-[10px] uppercase tracking-wide text-neutral-500 cursor-pointer select-none hover:text-neutral-400 flex items-center gap-1.5">
        <ChevronRight :size="14" class="transition-transform group-open:rotate-90 shrink-0" />
        Memory Files
        <span class="text-neutral-600 ml-auto tabular-nums normal-case tracking-normal">{{ data.memoryFiles.length }}</span>
      </summary>
      <div class="px-4 pb-3 space-y-1.5">
        <div v-for="f in data.memoryFiles" :key="f.path" class="flex items-center gap-3 text-xs">
          <span class="text-neutral-500 shrink-0 w-14">{{ f.type }}</span>
          <span class="text-neutral-300 font-mono truncate flex-1 text-[11px]" :title="f.path">{{ shortenPath(f.path) }}</span>
          <span class="text-neutral-500 tabular-nums shrink-0">{{ fmt(f.tokens) }}</span>
        </div>
      </div>
    </details>

    <!-- Skills -->
    <details v-if="data.skills?.length" class="border-t border-neutral-800 group">
      <summary class="px-4 py-2.5 text-[10px] uppercase tracking-wide text-neutral-500 cursor-pointer select-none hover:text-neutral-400 flex items-center gap-1.5">
        <ChevronRight :size="14" class="transition-transform group-open:rotate-90 shrink-0" />
        Skills
        <span class="text-neutral-600 ml-auto tabular-nums normal-case tracking-normal">{{ data.skills.length }}</span>
      </summary>
      <div class="px-4 pb-3 space-y-1.5">
        <div v-for="s in data.skills" :key="s.name" class="flex items-center gap-3 text-xs">
          <span class="text-neutral-300 truncate flex-1">{{ s.name }}</span>
          <span class="text-neutral-500 tabular-nums shrink-0">{{ fmt(s.tokens) }}</span>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'

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

const visibleCategories = computed(() =>
  props.data.categories.filter(c => c.name !== 'Free space' && c.name !== 'Autocompact buffer')
)

const usageColor = computed(() => {
  const p = props.data.percentage
  if (p >= 90) return 'text-red-400'
  if (p >= 75) return 'text-yellow-400'
  return 'text-neutral-200'
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
