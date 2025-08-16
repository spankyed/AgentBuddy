<template>
  <!-- Show Trace Viewer or Database UI based on viewMode -->
  <TraceHistoryViewer v-if="viewMode === 'trace'" />
  <div v-else class="flex w-full h-full overflow-hidden bg-neutral-800">
    <!-- Schema Panel -->
    <div 
      ref="schemaPanel"
      class="relative flex-shrink-0 overflow-hidden border-r shadow-sm bg-neutral-900 border-neutral-800"
      :style="{ width: schemaPanelWidth + 'rem' }"
    >
      <SchemaPanel />
      
      <!-- Resize Handle -->
      <div
        class="absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-neutral-600/20"
        @mousedown="startResizeSchema"
      >
        <div class="absolute inset-y-0 right-0 w-4 -mr-2"></div>
      </div>
    </div>
    
    <!-- Main Content Area (Vertical Stack) -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Query Editor -->
      <div 
        ref="queryPanel"
        class="relative overflow-hidden shadow-sm bg-neutral-900"
        :style="{ height: queryPanelHeight + '%' }"
      >
        <QueryEditor />
        
        <!-- Resize Handle (Horizontal) -->
        <div
          class="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize group hover:bg-neutral-600/20"
          @mousedown="startResizeQuery"
        >
          <div class="absolute inset-x-0 bottom-0 h-4 -mb-2"></div>
        </div>
      </div>
      
      <!-- Results Table -->
      <div class="flex-1 overflow-hidden border-t shadow-sm bg-neutral-900 border-neutral-800">
        <SimpleTable />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/main'
import { id as databaseId, type DatabaseState } from './state'

import SimpleTable from './components/simple-table/SimpleTable.vue'
import SchemaPanel from './components/SchemaPanel.vue'
import QueryEditor from './components/QueryEditor.vue'
import TraceHistoryViewer from './components/trace/TraceHistoryViewer.vue'

const databaseActor: DatabaseState = applicationState.system.get(databaseId)
const viewMode = useSelector(databaseActor, (state) => state.context.viewMode)

// Panel sizing
const schemaPanelWidth = ref(15)
const queryPanelHeight = ref(50) // percentage
const minSchemaPanelWidth = 200
const maxSchemaPanelWidth = 400
const minQueryPanelHeight = 30
const maxQueryPanelHeight = 70

// Resize functionality
let isResizingSchema = false
let isResizingQuery = false
let startX = 0
let startY = 0
let startWidth = 0
let startHeight = 0

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
  startY = e.clientY
  const mainContentHeight = window.innerHeight
  startHeight = queryPanelHeight.value * mainContentHeight / 100
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function handleMouseMove(e: MouseEvent) {
  if (isResizingSchema) {
    const diff = e.clientX - startX
    const newWidth = Math.max(minSchemaPanelWidth, Math.min(maxSchemaPanelWidth, startWidth + diff))
    schemaPanelWidth.value = newWidth
  } else if (isResizingQuery) {
    const mainContentHeight = window.innerHeight
    const diff = e.clientY - startY
    const newHeightPx = startHeight + diff
    const newHeightPercent = (newHeightPx / mainContentHeight) * 100
    queryPanelHeight.value = Math.max(minQueryPanelHeight, Math.min(maxQueryPanelHeight, newHeightPercent))
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