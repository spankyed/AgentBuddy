<template>
  <div class="relative flex-1">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      class="w-full h-full bg-neutral-900"
      :fit-view-on-init="true"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-edge-options="{
        type: 'generic',
        style: { strokeWidth: 2 },
        markerEnd: MarkerType.Arrow
      }"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :connect-on-click="true"
      @node-click="handleNodeClick"
      @connect="$emit('connect', $event)"
      @drop="$emit('drop', $event)"
      @dragover.prevent
      @nodes-initialized="$emit('nodes-initialized')"
      :min-zoom="0.2"
      :max-zoom="2"
    >
      <template v-for="(_, type) in nodeTypes" #[`node-${type}`]="nodeProps">
        <component :is="nodeTypes[type]" v-bind="nodeProps" :key="type" />
      </template>
      <template #edge-generic="edgeProps">
        <GenericEdge v-bind="edgeProps" />
      </template>
      <Background variant="dots" />
      <Controls />
      <MiniMap 
        :maskColor="'#26262650'" 
        :maskStrokeColor="'transparent'" 
        class="opacity-[0.15] hover:opacity-100 transition-opacity duration-200 bg-neutral-900 border border-neutral-700 rounded-lg"
      />

      <!-- Back button and Actions menu (top left) -->
      <div class="absolute z-10 flex gap-2 top-4 left-4">
        <!-- Back button -->
        <Button
          variant="secondary"
          class="!p-2 !h-auto border border-neutral-800 hover:bg-neutral-800 text-neutral-50 bg-neutral-900/90"
          @click="$emit('go-back')"
          title="Back to flows list"
        >
          <ChevronLeft :size="18" />
        </Button>
        
        <!-- Actions menu -->
        <FlowActionsMenu 
          :selected-flow-id="selectedFlowId"
          @layout="(direction) => $emit('layout', direction)"
          @edit-label="$emit('edit-label')"
        />
      </div>
    </VueFlow>
    
    <!-- Backdrop overlay when in list state -->
    <div 
      v-if="showOverlay" 
      class="absolute top-0 left-0 z-10 w-full h-full cursor-pointer bg-black/40 backdrop-blur-sm"
      @click="$emit('overlay-click')"
    >
      <div class="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none top-20 left-1/2">
        <div class="px-4 py-2 text-center border rounded-lg bg-neutral-900/90 border-neutral-700">
          <div class="text-sm text-neutral-300">Click anywhere to view</div>
          <div v-if="props.selectedFlowLabel" class="mt-1 font-medium text-neutral-100">
            {{ props.selectedFlowLabel }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  useVueFlow,
} from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode, Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ChevronLeft } from 'lucide-vue-next'
import { nextTick } from 'vue'

import GenericEdge from '../edges/GenericEdge.vue'
import { nodeTypes } from '../nodes'

import type { Direction } from '@/plugins/flows/canvas/useLayout'
import Button from '@/core/design/button.vue'
import FlowActionsMenu from './FlowActionsMenu.vue'

interface Props {
  nodes: VueFlowNode[]
  edges: Edge[]
  selectedFlowId?: string | null
  selectedFlowLabel?: string
  showOverlay?: boolean
}

const props = defineProps<Props>()
const { setCenter, getViewport } = useVueFlow()

const emit = defineEmits<{
  'node-click': [event: NodeMouseEvent]
  'connect': [params: Connection]
  'drop': [event: DragEvent]
  'go-back': []
  'layout': [direction?: Direction]
  'edit-label': []
  'overlay-click': []
  'nodes-initialized': []
}>()

async function handleNodeClick(event: NodeMouseEvent) {
  // Calculate the visible area considering the form panel (40% width on right)
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const nodePaletteWidth = 240 // w-60 = 15rem = 240px
  const formPanelWidth = viewportWidth * 0.4 // 40% for the form
  const visibleWidth = viewportWidth - nodePaletteWidth - formPanelWidth
  const visibleCenterX = nodePaletteWidth + (visibleWidth / 2)
  
  // Get the node position and dimensions
  const nodeX = event.node.position.x
  const nodeY = event.node.position.y
  const nodeWidth = event.node.dimensions?.width || 150
  const nodeHeight = event.node.dimensions?.height || 50
  
  // Calculate offset to position node in the visible area
  // We want to move the camera/viewport to the RIGHT so the node appears to move LEFT
  // This keeps the node visible when the form panel opens on the right
  const targetX = nodeX + (formPanelWidth / 2) - nodeWidth
  const targetY = nodeY + (viewportHeight * 0.05) // Move camera down so node appears higher
  
  // Pan to the adjusted position with fixed zoom
  await nextTick()
  const fixedZoom = 1.75 // Fixed zoom level for consistent node viewing
  setCenter(targetX, targetY, { 
    zoom: fixedZoom,
    duration: 300 // Smooth animation
  })
  
  // Emit the event after repositioning
  emit('node-click', event)
}
</script> 