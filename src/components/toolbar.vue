<template>
  <div class="flex flex-col w-16 h-full py-4 text-white border-r border-neutral-800">
    <div class="flex flex-col h-full">
      <!-- Scrollable section -->
      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div class="flex flex-col items-center space-y-6">
          <button
            v-for="item in pluginItems"
            :key="item.id"
            :class="[
              'p-2 rounded-lg transition-all duration-200 ease-in-out',
              activeItem === item.id
                ? 'bg-primary-600 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-primary-700'
            ]"
            @click="$emit('select-item', item.id)"
            :title="item.label"
          >
            <component :is="item.icon" :size="24" />
          </button>
        </div>
      </div>

      <!-- Pinned bottom section -->
      <div class="flex flex-col items-center space-y-6 mt-auto pt-6">
        <button
          v-for="item in pinnedItems"
          :key="item.id"
          :class="[
            'p-2 rounded-lg transition-all duration-200 ease-in-out',
            activeItem === item.id
              ? 'bg-primary-600 text-white'
              : 'text-neutral-400 hover:text-white hover:bg-primary-700'
          ]"
          @click="$emit('select-item', item.id)"
          :title="item.label"
        >
          <component :is="item.icon" :size="24" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { 
  LayoutGrid, 
  Code, 
  Box, 
  Folder, 
  ChevronRight, 
  Star, 
  BarChart2, 
  Settings,
  Brain,
  History,
  Sparkle,
  Workflow,
  Bird
} from 'lucide-vue-next'

interface ToolbarProps {
  activeItem: string
}

defineProps<ToolbarProps>()
defineEmits<(e: 'select-item', item: string) => void>()

const pluginItems = [
  { id: 'history', icon: History, label: 'History' },
  { id: 'dialog', icon: Workflow, label: 'Dialog' },
  { id: 'brain', icon: Brain, label: 'Brain' },
  { id: 'files', icon: Folder, label: 'Files' },
  { id: 'code', icon: Code, label: 'Code' },
  { id: 'components', icon: Box, label: 'Components' },
  { id: 'prompt', icon: Sparkle, label: 'Prompt Builder' },
  { id: 'angel', icon: Bird, label: 'Angel' },
]

const pinnedItems = [
  { id: 'plugins', icon: LayoutGrid, label: 'Plugins' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]
</script>

<style lang="scss" module>
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari and Opera */
}
</style> 