<template>
  <div class="h-full overflow-y-auto">
    <div v-if="tree.children && tree.children.length > 0">
      <FileTreeItem
        v-for="child in sortedRootChildren"
        :key="child.path"
        :item="child"
        :level="0"
        @select-file="$emit('select-file', $event)"
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

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: GitStatusFile['status']
  children?: TreeNode[]
  fileCount?: number
}

const props = defineProps<{
  files: GitStatusFile[]
}>()

defineEmits<{
  'select-file': [file: TreeNode]
}>()

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
      const folderName = parts[i]
      let folder = currentNode.children?.find(
        child => child.type === 'folder' && child.name === folderName
      )
      
      if (!folder) {
        folder = {
          name: folderName,
          path: parts.slice(0, i + 1).join('/'),
          type: 'folder',
          children: [],
          fileCount: 0
        }
        currentNode.children!.push(folder)
      }
      
      currentNode = folder
    }
    
    // Add file
    const fileName = parts[parts.length - 1]
    currentNode.children!.push({
      name: fileName,
      path: file.path,
      type: 'file',
      status: file.status
    })
  })
  
  // Calculate file counts
  const calculateFileCounts = (node: TreeNode): number => {
    if (node.type === 'file') return 1
    
    let count = 0
    if (node.children) {
      for (const child of node.children) {
        count += calculateFileCounts(child)
      }
    }
    node.fileCount = count
    return count
  }
  
  calculateFileCounts(root)
  
  return root
})

const sortedRootChildren = computed(() => {
  if (!tree.value.children) return []
  
  // Sort folders first, then files, alphabetically within each group
  return [...tree.value.children].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})
</script>