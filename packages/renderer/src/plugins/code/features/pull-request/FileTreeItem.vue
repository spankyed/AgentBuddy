<template>
  <div>
    <!-- Folder -->
    <div
      v-if="item.type === 'folder'"
      class="group"
    >
      <button
        @click="toggleExpanded"
        class="flex items-center w-full gap-2 px-2 py-1 transition-colors rounded hover:bg-neutral-800 min-w-0"
        :style="{ paddingLeft: `${(level * 16) + 12}px` }"
      >
        <ChevronRight
          :class="['w-3 h-3 text-neutral-400 transition-transform', { 'rotate-90': expanded }]"
        />
        <Folder class="w-4 h-4 text-neutral-500" />
        <span class="text-sm text-neutral-200 truncate" :title="item.path">{{ item.name }}</span>
        <span class="ml-auto mr-2 text-xs text-neutral-500 shrink-0">{{ item.fileCount }}</span>
      </button>
      
      <!-- Children -->
      <div v-show="expanded">
        <FileTreeItem
          v-for="child in sortedChildren"
          :key="child.path"
          :item="child"
          :level="level + 1"
          :all-collapsed="allCollapsed"
          :all-expanded="allExpanded"
          :base-directory="baseDirectory"
          @select-file="$emit('select-file', $event)"
          @open-file="$emit('open-file', $event)"
        />
      </div>
    </div>
    
    <!-- File -->
    <ContextMenuRoot v-else @update:open="onMenuOpenChange">
      <ContextMenuTrigger as-child>
        <div
          class="flex items-center w-full gap-2 px-2 py-1 transition-colors rounded hover:bg-neutral-800 cursor-pointer min-w-0"
          :style="{ paddingLeft: `${(level * 16) + 12 + 20}px` }"
          @click="$emit('select-file', item)"
        >
          <FileCode class="w-4 h-4 text-neutral-400 shrink-0" />
          <span class="text-sm text-neutral-200 truncate" :title="item.path">{{ item.name }}</span>
          <span :class="getStatusColor(item.status)" class="ml-auto w-4 text-xs font-medium shrink-0">
            {{ getStatusIcon(item.status) }}
          </span>
          <button
            @click.stop="$emit('open-file', item)"
            class="p-0.5 hover:bg-neutral-700 rounded"
            title="Open file"
          >
            <File class="w-3 h-3 text-neutral-400" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuPortal>
        <ContextMenuContent :class="MENU_CONTENT_CLASS">
          <ContextMenuItem @select="$emit('open-file', item)" :class="MENU_ITEM_CLASS">
            <File class="w-4 h-4" /> Open File
          </ContextMenuItem>
          <ContextMenuItem @select="copyPath(item.path)" :class="MENU_ITEM_CLASS">
            <Copy class="w-4 h-4" /> Copy Path
          </ContextMenuItem>
          <ContextMenuItem @select="copyRelativePath(item.path)" :class="MENU_ITEM_CLASS">
            <Copy class="w-4 h-4" /> Copy Relative Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenuRoot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronRight, Folder, FileCode, File, Copy } from 'lucide-vue-next'
import {
  ContextMenuRoot, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuPortal
} from 'reka-ui'
import { MENU_ITEM_CLASS, MENU_CONTENT_CLASS } from '@/plugins/code/features/explorer/constants'
import { onMenuOpenChange } from '@/core/composables/useMenuState'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import type { TreeNode } from './types'

const props = withDefaults(defineProps<{
  item: TreeNode
  level?: number
  allCollapsed?: boolean
  allExpanded?: boolean
  baseDirectory?: string
}>(), {
  level: 0,
  allCollapsed: false,
  allExpanded: false,
  baseDirectory: ''
})

const emit = defineEmits<{
  'select-file': [file: TreeNode]
  'open-file': [file: TreeNode]
}>()

const expanded = ref(true)

// Watch for collapse/expand all changes
watch(() => [props.allCollapsed, props.allExpanded] as const, ([collapsed, allExpanded]) => {
  if (props.item.type !== 'folder') return
  
  if (collapsed) {
    expanded.value = false
  } else if (allExpanded) {
    expanded.value = true
  }
})

const sortedChildren = computed(() => {
  if (!props.item.children) return []
  
  return [...props.item.children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

const toggleExpanded = () => expanded.value = !expanded.value

const copyPath = async (path: string) => {
  try { await navigator.clipboard.writeText(path) } catch (err) { console.error('Failed to copy path:', err) }
}

const copyRelativePath = async (path: string) => {
  try {
    const base = props.baseDirectory
    let rel = path
    if (base && rel.startsWith(base)) {
      rel = rel.slice(base.length)
      if (rel.startsWith('/')) rel = rel.slice(1)
    }
    await navigator.clipboard.writeText(rel)
  } catch (err) { console.error('Failed to copy path:', err) }
}

const statusConfig: Record<GitStatusFile['status'], { icon: string; color: string }> = {
  modified: { icon: 'M', color: 'text-yellow-500' },
  added: { icon: 'A', color: 'text-green-500' },
  deleted: { icon: 'D', color: 'text-red-500' },
  renamed: { icon: 'R', color: 'text-blue-500' },
  untracked: { icon: 'U', color: 'text-neutral-500' },
  copied: { icon: 'C', color: 'text-purple-500' },
  typechange: { icon: 'T', color: 'text-orange-500' },
  unmerged: { icon: 'U', color: 'text-red-600' }
}

const getStatusIcon = (status?: GitStatusFile['status']) => 
  status ? statusConfig[status]?.icon ?? '?' : '?'

const getStatusColor = (status?: GitStatusFile['status']) => 
  status ? statusConfig[status]?.color ?? 'text-neutral-400' : 'text-neutral-400'
</script>