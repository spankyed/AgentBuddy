<template>
  <div class="p-3">
    <div class="mt-3 space-y-1">
      <button
        v-for="item in paletteItems"
        :key="item.type"
        class="w-full group flex items-center gap-3 px-3 py-2 bg-neutral-900 rounded-lg text-neutral-100 cursor-grab text-sm transition-all duration-200 hover:bg-neutral-700 hover:border-neutral-600 hover:shadow-sm active:cursor-grabbing active:scale-[0.98]"
        draggable="true"
        @dragstart="(e) => handleDragStart(e, item.type)"
        @click="$emit('palette-click', item.type)"
      >
        <div class="w-1 h-1 transition-colors rounded-full bg-neutral-500 group-hover:bg-green-500"></div>
        <span>{{ item.label }}</span>
        <component
          :is="item.icon"
          class="w-4 h-4 ml-auto text-neutral-500 group-hover:text-neutral-300"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  Workflow,
  Radio,
  Zap,
  Play,
  Plus,
  RefreshCw,
  Search,
  Split,
  Shuffle
} from 'lucide-vue-next'

interface PaletteItem {
  type: string
  label: string
  icon: any
}

const props = withDefaults(defineProps<{
  paletteItems?: PaletteItem[]
}>(), {
  paletteItems: () => [
    { type: 'flow', label: 'Flow', icon: Workflow },
    { type: 'listen', label: 'Listen', icon: Radio },
    { type: 'fire', label: 'Fire', icon: Zap },
    { type: 'action', label: 'Action', icon: Play },
    { type: 'create', label: 'Create', icon: Plus },
    { type: 'update', label: 'Update', icon: RefreshCw },
    { type: 'query', label: 'Query', icon: Search },
    { type: 'decision', label: 'Decision', icon: Split },
    { type: 'transform', label: 'Transform', icon: Shuffle },
    { type: 'keep-alive', label: 'Keep Alive', icon: Activity },
  ]
})

const emit = defineEmits<{
  'palette-click': [nodeType: string]
  'drag-start': [e: DragEvent, nodeType: string]
}>()

function handleDragStart(e: DragEvent, nodeType: string) {
  e.dataTransfer?.setData('application/vueflow', nodeType)
  e.dataTransfer!.effectAllowed = 'move'
  emit('drag-start', e, nodeType)
}
</script> 