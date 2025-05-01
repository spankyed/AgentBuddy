<template>
  <div class="flex flex-col w-16 h-full py-4 text-white bg-primary-800 border-r border-neutral-800  ">
    <div class="flex flex-col items-center space-y-6">
      <button
        v-for="item in toolbarItems"
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
  Settings
} from 'lucide-vue-next'

interface ToolbarProps {
  activeItem: string
}

defineProps<ToolbarProps>()
defineEmits<(e: 'select-item', item: string) => void>()

const toolbarItems = [
  { id: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { id: 'code', icon: Code, label: 'Code' },
  { id: 'components', icon: Box, label: 'Components' },
  { id: 'files', icon: Folder, label: 'Files' },
  { id: 'terminal', icon: ChevronRight, label: 'Terminal' },
  { id: 'favorites', icon: Star, label: 'Favorites' },
  { id: 'analytics', icon: BarChart2, label: 'Analytics' },
  { id: 'settings', icon: Settings, label: 'Settings' },
]
</script>

<style scoped>
/* Add any component-specific styles here */
</style> 