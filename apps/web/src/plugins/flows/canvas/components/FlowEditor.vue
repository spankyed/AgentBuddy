<template>
  <div class="relative flex-1">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      class="w-full h-full bg-neutral-900"
      :fit-view-on-init="false"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-edge-options="{
        type: 'generic',
        style: { strokeWidth: 2 },
        markerEnd: MarkerType.Arrow
      }"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :connect-on-click="true"
      :edges-selectable="true"
      :edges-updatable="true"
      :delete-key-code="['Backspace', 'Delete']"
      :edge-updater-radius="10"
      :is-valid-connection="isValidConnection"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @connect="$emit('connect', $event)"
      @drop="$emit('drop', $event)"
      @dragover.prevent
      @nodes-initialized="$emit('nodes-initialized')"
      @node-drag-stop="$emit('node-drag-stop', $event)"
      @nodes-change="handleNodesChange"
      @edges-change="handleEdgesChange"
      @edge-update-start="handleEdgeUpdateStart"
      @edge-update="handleEdgeUpdate"
      @edge-update-end="handleEdgeUpdateEnd"
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
          @layout="(direction) => $emit('action-layout', direction)"
          @edit-label="$emit('action-edit-label')"
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
import { watch } from 'vue'
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  useVueFlow,
} from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode, Edge, EdgeMouseEvent, EdgeUpdateEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ChevronLeft } from 'lucide-vue-next'

import GenericEdge from '../edges/GenericEdge.vue'
import { nodeTypes } from '../nodes'
import { useNodeViewport } from '../useNodeViewport'

import type { Direction } from '@/plugins/flows/canvas/useLayout'
import Button from '@/core/design/button.vue'
import FlowActionsMenu from './FlowActionsMenu.vue'

interface Props {
  nodes: VueFlowNode[]
  edges: Edge[]
  selectedFlowId?: string | null
  selectedFlowLabel?: string
  selectedNodeId?: string
  showOverlay?: boolean
}

const props = defineProps<Props>()
const { centerNodeInView } = useNodeViewport()
const { getConnectedEdges, getNodes } = useVueFlow()

const emit = defineEmits<{
  'node-click': [event: NodeMouseEvent]
  'node-double-click': [event: NodeMouseEvent]
  'connect': [params: Connection]
  'drop': [event: DragEvent]
  'go-back': []
  'action-layout': [direction?: Direction]
  'action-edit-label': []
  'overlay-click': []
  'nodes-initialized': []
  'node-drag-stop': [event: NodeMouseEvent]
  'nodes-remove': [nodes: { id: string }[]]
  'edges-remove': [edges: { id: string }[]]
  'edge-update': [event: EdgeUpdateEvent]
  'edge-update-end': [event: EdgeMouseEvent]
}>()

// Watch for selected node changes and center the node
let previousSelectedId: string | undefined = undefined
watch(() => props.selectedNodeId, async (newSelectedId) => {
  if (newSelectedId && newSelectedId !== previousSelectedId) {
    // Small delay to ensure node is rendered and dimensions are available
    setTimeout(async () => {
      await centerNodeInView(newSelectedId)
    }, 100)
  }
  previousSelectedId = newSelectedId
})

function handleNodesChange(changes: any[]) {
  // Filter for remove changes
  const removedNodes = changes
    .filter(change => change.type === 'remove')
    .map(change => ({ id: change.id }));
  
  if (removedNodes.length > 0) {
    emit('nodes-remove', removedNodes);
  }
}

function handleEdgesChange(changes: any[]) {
  // Filter for remove changes
  const removedEdges = changes
    .filter(change => change.type === 'remove')
    .map(change => ({ id: change.id }));
  
  if (removedEdges.length > 0) {
    emit('edges-remove', removedEdges);
  }
}

async function handleNodeClick(event: NodeMouseEvent) {
  emit('node-click', event)
}

async function handleNodeDoubleClick(event: NodeMouseEvent) {
  emit('node-double-click', event)
}

// Edge reconnection handlers
function handleEdgeUpdateStart(event: EdgeMouseEvent) {
  // Edge update start - Vue Flow handles the drag state internally
}

function handleEdgeUpdate(event: EdgeUpdateEvent) {
  // Edge update event is fired when edge is successfully reconnected
  emit('edge-update', event)
}

function handleEdgeUpdateEnd(event: EdgeMouseEvent) {
  // Edge update end - Vue Flow handles cleanup
  emit('edge-update-end', event)
}

// Validation function to prevent multiple connections per handle
function isValidConnection(connection: Connection): boolean {
  // Always return true - let Vue Flow handle validation during edge updates
  // We'll validate connections in the state machine instead
  return true
}
</script> 