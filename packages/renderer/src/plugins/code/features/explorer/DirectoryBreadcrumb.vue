<template>
  <div class="p-2 border-b border-neutral-800">
    <div class="flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
      <span
        v-for="(segment, index) in segments"
        :key="index"
        class="flex items-center flex-shrink-0"
      >
        <!-- Ellipsis segment with dropdown -->
        <DropdownMenuRoot v-if="segment.isEllipsis">
          <DropdownMenuTrigger as-child>
            <button
              class="px-2 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              title="Hidden directories"
            >
              {{ segment.name }}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
              :side-offset="5"
            >
              <DropdownMenuItem
                v-for="hidden in segment.hiddenSegments"
                :key="hidden.path"
                @select="() => $emit('navigate', hidden.path)"
                class="px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                {{ hidden.name }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        
        <!-- Regular segment with context menu -->
        <ContextMenuRoot v-else>
          <ContextMenuTrigger as-child>
            <button
              @click="$emit('navigate', segment.path)"
              class="px-2 py-1 transition-all rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              :class="{ 
                'font-medium text-neutral-200': segment.path === currentDirectory
              }"
              :title="segment.path"
            >
              {{ segment.name }}
            </button>
          </ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent
              class="min-w-[160px] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg py-1 z-50"
            >
              <ContextMenuItem
                @select="() => $emit('set-root', segment.path)"
                class="px-3 py-2 text-sm transition-colors cursor-pointer text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
              >
                Set as Root Directory
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenuRoot>
        
        <span v-if="index < segments.length - 1" class="text-neutral-600 mx-0.5">/</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
} from 'reka-ui'

interface BreadcrumbSegment {
  name: string
  path: string
  isEllipsis?: boolean
  hiddenSegments?: Array<{ name: string; path: string }>
}

const props = defineProps<{
  rootDirectory: string | null
  currentDirectory: string | null
}>()

defineEmits<{
  'navigate': [path: string]
  'set-root': [path: string]
}>()

const segments = computed<BreadcrumbSegment[]>(() => {
  const root = props.rootDirectory
  const current = props.currentDirectory
  
  if (!root || !current) return []
  
  const normalizedRoot = root.endsWith('/') && root.length > 1 
    ? root.slice(0, -1) 
    : root
  const normalizedCurrent = current.endsWith('/') && current.length > 1 
    ? current.slice(0, -1) 
    : current
    
  const allSegments: Array<{ name: string; path: string }> = []
  
  const rootName = normalizedRoot.split('/').filter(Boolean).pop() || '/'
  
  if (normalizedCurrent.startsWith(normalizedRoot)) {
    allSegments.push({ name: `~/${rootName}`, path: normalizedRoot })
    
    const relativePath = normalizedCurrent.slice(normalizedRoot.length)
    if (relativePath) {
      const segments = relativePath.split('/').filter(Boolean)
      let currentPath = normalizedRoot
      
      segments.forEach(segment => {
        currentPath = currentPath + '/' + segment
        allSegments.push({ name: segment, path: currentPath })
      })
    }
  } else {
    allSegments.push({ name: '/', path: '/' })
    const segments = normalizedCurrent.slice(1).split('/').filter(Boolean)
    let currentPath = ''
    
    segments.forEach(segment => {
      currentPath = currentPath + '/' + segment
      allSegments.push({ name: segment, path: currentPath })
    })
  }
  
  // Apply truncation if needed
  const maxVisibleSegments = 5
  if (allSegments.length <= maxVisibleSegments) {
    return allSegments
  }
  
  // Keep first 2 and last 2, put ellipsis in middle
  const result: BreadcrumbSegment[] = []
  const firstSegments = allSegments.slice(0, 2)
  const lastSegments = allSegments.slice(-2)
  const hiddenSegments = allSegments.slice(2, -2)
  
  result.push(...firstSegments)
  result.push({
    name: '...',
    path: hiddenSegments[hiddenSegments.length - 1].path,
    isEllipsis: true,
    hiddenSegments: hiddenSegments
  })
  result.push(...lastSegments)
  
  return result
})
</script>