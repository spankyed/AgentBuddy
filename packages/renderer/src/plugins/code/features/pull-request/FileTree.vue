<template>
  <div class="h-full overflow-y-auto p-1">
    <div v-if="tree.children && tree.children.length > 0">
      <FileTreeItem
        v-for="child in sortedRootChildren"
        :key="child.path"
        :item="child"
        :level="0"
        :all-collapsed="allCollapsed"
        :all-expanded="allExpanded"
        @select-file="$emit('select-file', $event)"
        @open-file="$emit('open-file', $event)"
      />
    </div>
    <div v-else class="p-4 text-sm text-center text-neutral-500">
      No changes found
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FileTreeItem from '@/plugins/code/features/pull-request/FileTreeItem.vue'
import type { GitStatusFile } from '@/plugins/code/features/commit/state'
import type { TreeNode } from './types'

const props = defineProps<{
  files: GitStatusFile[]
  allCollapsed?: boolean
  allExpanded?: boolean
}>()

defineEmits<{
  'select-file': [file: TreeNode]
  'open-file': [file: TreeNode]
}>()

// Helper functions
const sortNodes = (nodes: TreeNode[]) => {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

const calculateFileCounts = (node: TreeNode): number => {
  if (node.type === 'file') return 1
  
  const count = node.children?.reduce((sum, child) => 
    sum + calculateFileCounts(child), 0) ?? 0
  node.fileCount = count
  return count
}

const findOrCreateFolder = (parent: TreeNode, name: string, path: string): TreeNode => {
  let folder = parent.children?.find(
    child => child.type === 'folder' && child.name === name
  )
  
  if (!folder) {
    folder = {
      name,
      path,
      type: 'folder',
      children: [],
      fileCount: 0
    }
    parent.children!.push(folder)
  }
  
  return folder
}

// Build tree structure from flat file list
const tree = computed(() => {
  const root: TreeNode = {
    name: 'root',
    path: '',
    type: 'folder',
    children: []
  }
  
  // Build tree structure
  props.files.forEach(file => {
    const parts = file.path.split('/')
    let currentNode = root
    
    // Navigate/create folders
    for (let i = 0; i < parts.length - 1; i++) {
      currentNode = findOrCreateFolder(
        currentNode,
        parts[i],
        parts.slice(0, i + 1).join('/')
      )
    }
    
    // Add file
    currentNode.children!.push({
      name: parts[parts.length - 1],
      path: file.path,
      type: 'file',
      status: file.status
    })
  })
  
  calculateFileCounts(root)
  return root
})

const sortedRootChildren = computed(() => 
  tree.value.children ? sortNodes(tree.value.children) : []
)
</script>