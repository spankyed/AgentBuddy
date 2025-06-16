<template>
  <div class="flex w-full h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
    <!-- Schema Panel -->
    <div 
      ref="schemaPanel"
      class="relative flex-shrink-0 overflow-hidden bg-white border-r border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700"
      :style="{ width: schemaPanelWidth + 'px' }"
    >
      <SchemaPanel />
      
      <!-- Resize Handle -->
      <div
        class="absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-blue-500/20"
        @mousedown="startResizeSchema"
      >
        <div class="absolute inset-y-0 right-0 w-4 -mr-2"></div>
      </div>
    </div>
    
    <!-- Main Content Area -->
    <div class="flex flex-1 min-w-0">
      <!-- Query Editor -->
      <div 
        ref="queryPanel"
        class="relative overflow-hidden bg-white shadow-sm dark:bg-gray-800"
        :style="{ width: queryPanelWidth + '%' }"
      >
        <QueryEditor />
        
        <!-- Resize Handle -->
        <div
          class="absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-blue-500/20"
          @mousedown="startResizeQuery"
        >
          <div class="absolute inset-y-0 right-0 w-4 -mr-2"></div>
        </div>
      </div>
      
      <!-- Results Table -->
      <div class="flex-1 overflow-hidden bg-white shadow-sm dark:bg-gray-800">
        <SimpleTable />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SchemaPanel from './components/SchemaPanel.vue'
import QueryEditor from './components/QueryEditor.vue'
import SimpleTable from './components/graph/simple-table/SimpleTable.vue'

// Panel sizing
const schemaPanelWidth = ref(280)
const queryPanelWidth = ref(50) // percentage
const minSchemaPanelWidth = 200
const maxSchemaPanelWidth = 400
const minQueryPanelWidth = 30
const maxQueryPanelWidth = 70

// Resize functionality
let isResizingSchema = false
let isResizingQuery = false
let startX = 0
let startWidth = 0

function startResizeSchema(e: MouseEvent) {
  isResizingSchema = true
  startX = e.clientX
  startWidth = schemaPanelWidth.value
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizeQuery(e: MouseEvent) {
  isResizingQuery = true
  startX = e.clientX
  const mainContentWidth = window.innerWidth - schemaPanelWidth.value
  startWidth = queryPanelWidth.value * mainContentWidth / 100
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleMouseMove(e: MouseEvent) {
  if (isResizingSchema) {
    const diff = e.clientX - startX
    const newWidth = Math.max(minSchemaPanelWidth, Math.min(maxSchemaPanelWidth, startWidth + diff))
    schemaPanelWidth.value = newWidth
  } else if (isResizingQuery) {
    const mainContentWidth = window.innerWidth - schemaPanelWidth.value
    const diff = e.clientX - startX
    const newWidthPx = startWidth + diff
    const newWidthPercent = (newWidthPx / mainContentWidth) * 100
    queryPanelWidth.value = Math.max(minQueryPanelWidth, Math.min(maxQueryPanelWidth, newWidthPercent))
  }
}

function handleMouseUp() {
  isResizingSchema = false
  isResizingQuery = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script> 