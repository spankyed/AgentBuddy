<template>
  <div>
    <!-- Folder -->
    <div
      v-if="item.type === 'folder'"
      class="group"
    >
      <button
        @click="toggleExpanded"
        class="flex items-center w-full gap-2 px-2 py-1 transition-colors rounded hover:bg-neutral-800"
        :style="{ paddingLeft: `${(level * 16) + 8}px` }"
      >
        <ChevronRight
          :class="['w-3 h-3 text-neutral-400 transition-transform', { 'rotate-90': expanded }]"
        />
        <Folder class="w-4 h-4 text-neutral-500" />
        <span class="text-sm text-neutral-200">{{ item.name }}</span>
        <span class="ml-auto mr-2 text-xs text-neutral-500">{{ item.fileCount }}</span>
      </button>
      
      <!-- Children -->
      <div v-if="expanded">
        <FileTreeItem
          v-for="child in sortedChildren"
          :key="child.path"
          :item="child"
          :level="level + 1"
          @select-file="$emit('select-file', $event)"
        />
      </div>
    </div>
    
    <!-- File -->
    <button
      v-else
      @click="$emit('select-file', item)"
      class="flex items-center w-full gap-2 px-2 py-1 transition-colors rounded hover:bg-neutral-800"
      :style="{ paddingLeft: `${(level * 16) + 8 + 20}px` }"
    >
      <span :class="getStatusColor(item.status)" class="w-4 text-xs font-medium">
        {{ getStatusIcon(item.status) }}
      </span>
      <FileCode class="w-4 h-4 text-neutral-400" />
      <span class="text-sm text-neutral-200">{{ item.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, withDefaults } from 'vue'
import { ChevronRight, Folder, FileCode } from 'lucide-vue-next'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}

const props = withDefaults(defineProps<{
  item: TreeNode
  level?: number
}>(), {
  level: 0
})

defineEmits<{
  'select-file': [file: TreeNode]
}>()

const expanded = ref(true)

const sortedChildren = computed(() => {
  if (!props.item.children) return []
  
  // Sort folders first, then files, alphabetically within each group
  return [...props.item.children].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})

const toggleExpanded = () => {
  expanded.value = !expanded.value
}

const getStatusIcon = (status?: GitStatusFile['status']) => {
  switch (status) {
    case 'modified': return 'M'
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'untracked': return 'U'
    case 'copied': return 'C'
    case 'typechange': return 'T'
    case 'unmerged': return 'U'
    default: return '?'
  }
}

const getStatusColor = (status?: GitStatusFile['status']) => {
  switch (status) {
    case 'modified': return 'text-yellow-500'
    case 'added': return 'text-green-500'
    case 'deleted': return 'text-red-500'
    case 'renamed': return 'text-blue-500'
    case 'untracked': return 'text-neutral-500'
    case 'copied': return 'text-purple-500'
    case 'typechange': return 'text-orange-500'
    case 'unmerged': return 'text-red-600'
    default: return 'text-neutral-400'
  }
}
</script>