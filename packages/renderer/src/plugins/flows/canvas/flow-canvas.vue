<template>
  <div class="relative flex w-full h-full overflow-hidden">
    <!-- ▸ Node palette (left) -->
    <aside class="overflow-y-auto text-white border-r w-60 bg-neutral-900 border-neutral-800">
      <!-- Flows list view -->
      <FlowsList
        v-if="inListState"
        :flows="flows"
        :root-flow="rootFlow"
        :selected-flow-id="selectedFlowId"
        @flow-click="handleFlowClick"
        @create-flow="handleCreateFlow"
      />

      <!-- Steps palette view -->
      <NodePalette
        v-if="inViewState"
        @palette-click="handlePaletteClick"
        @drag-start="handleDragStart"
      />
    </aside>

    <!-- ▸ VueFlow canvas (center) -->
    <FlowEditor
      :nodes="plainNodes"
      :edges="plainEdges"
      :selected-flow-id="selectedFlowId"
      :selected-flow-label="currentFlowLabel"
      :selected-node-id="selected?.id"
      :editing-node-id="editingNode?.id"
      :show-overlay="inListState"
      @node-click="handleNodeClick"
      @node-double-click="handleNodeDoubleClick"
      @connect="handleConnect"
      @drop="handleDrop"
      @go-back="handleGoBack"
      @action-layout="handleLayout"
      @action-edit-label="openLabelDialog"
      @overlay-click="handleOverlayClick"
      @nodes-initialized="handleNodesInitialized"
      @node-drag-stop="handleNodeDragStop"
      @nodes-remove="handleNodesRemove"
      @selection-change="handleSelectionChange"
      @edges-remove="handleEdgesRemove"
      @edge-update="handleEdgeUpdate"
      @edge-update-end="handleEdgeUpdateEnd"
    />

    <!-- ▸ Node form overlay -->
    <NodeForm
      :selected-node="editingNode"
      :actions="actions"
      :flows="flows"
      :models="models"
      :prompts="prompts"
      @close="handleCloseNodeEditor"
      @update-node="handleNodeUpdate"
      @create-connected="handleCreateConnectedNode"
    />

    <!-- Label Edit Dialog -->
    <FlowLabelDialog
      v-model="labelDialogOpen"
      :flow-label="currentFlowLabel"
      @cancel="labelDialogOpen = false"
      @save="handleUpdateFlowLabel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type Ref, ref, watch, nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode, Edge, EdgeUpdateEvent, EdgeMouseEvent } from '@vue-flow/core'
import { useLayout, type Direction } from '@/plugins/flows/canvas/useLayout'
import { useNodeViewport } from '@/plugins/flows/canvas/useNodeViewport'
import type { FlowEntity, NodeEntity } from '@app/api'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { applicationState } from '@/main'
import {
  id,
  type FlowsState,
} from '@/plugins/flows/state'
import { useSelector } from '@xstate/vue'

// Import sub-components
import FlowsList from './components/FlowsList.vue'
import NodePalette from './components/NodePalette.vue'
import FlowEditor from './components/FlowEditor.vue'
import NodeForm from './components/NodeForm.vue'
import FlowLabelDialog from './components/FlowLabelDialog.vue'

const { layout } = useLayout()
const { project } = useVueFlow()

// Dialog state
const labelDialogOpen = ref(false)

/* ------------------------------------------------------------ */
/*  reactive state from the actor                               */
/* ------------------------------------------------------------ */
const actor: FlowsState = applicationState.system.get(id)

const inListState = useSelector(actor, (s) => s.hasTag('list-flows'))
const inViewState = useSelector(actor, (s) => s.hasTag('view-flow'))
const nodes   = useSelector(actor, (s) => s.context.graph.nodes)
const edges   = useSelector(actor, (s) => s.context.graph.edges)
// const settings = useSelector(actor, (s) => s.context.settings)
const flows   = useSelector(actor, (s) => s.context.flows.filter((n) => n.id !== s.context.settings?.rootFlowId))
const rootFlow = useSelector(actor, (s) => s.context.flows.find((f) => f.id === s.context.settings?.rootFlowId))
const positions = useSelector(actor, (s) => s.context.graph.positions)
const selectedFlowId = useSelector(actor, (s) => s.context.selectedFlowId)
const selected = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.selectedNodeId)
) as Ref<NodeEntity | undefined>
const editingNode = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.editingNodeId)
) as Ref<NodeEntity | undefined>
const actions = useSelector(actor, (s) => s.context.actions)
const models = useSelector(actor, (s) => s.context.models)
const prompts = useSelector(actor, (s) => s.context.prompts)

const plainNodes = computed(() => {
  const mappedNodes = nodes.value
    .map((n) => ({
      id       : n.id!,
      type     : n.nodeType,
      position : { 
        x: positions.value[n.id]?.x ?? 0,  // Use position from positions object
        y: positions.value[n.id]?.y ?? 0 
      },
      data     : n,  // Let VueFlow handle selection state
    })) as VueFlowNode[]

  return mappedNodes
})

const plainEdges = computed(() =>
  Object.values(edges.value).map((e, idx) => {
    // Find the source node to check if it's an event node
    const sourceNode = nodes.value.find(n => n.id === e.source)
    const isFromEventNode = sourceNode?.nodeType === 'listen'
    
    return {
      id     : e.id,
      source : e.source,
      target : e.target,
      data: { kind: e.kind },
      animated: e.kind === 'transitions_to' && isFromEventNode,
    }
  }),
)

const currentFlowLabel = computed(() => {
  const currentFlow = rootFlow.value?.id === selectedFlowId.value 
    ? rootFlow.value 
    : flows.value.find(f => f.id === selectedFlowId.value)
  
  return currentFlow?.label || ''
})

/* ------------------------------------------------------------ */
/*  Event handlers                                              */
/* ------------------------------------------------------------ */

function handleDragStart(e: DragEvent, nodeType: string) {
  // Data is already set in the NodePalette component
}

function handleDrop(e: DragEvent) {
  const nodeType = e.dataTransfer?.getData('application/vueflow')
  if (!nodeType) return
  
  // Get the bounding rect of the target element
  const target = e.target as HTMLElement
  const rect = target.getBoundingClientRect()
  
  // Calculate position relative to the flow container
  const position = project({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  })
  
  actor.send({
    type: 'NODE.CREATE',
    nodeType,
    position,
  })
}

function handlePaletteClick(nodeType: string) {
  actor.send({
    type: 'NODE.CREATE',
    nodeType,
  })
}

function handleCreateConnectedNode(nodeType: string, sourceNodeId: string) {
  actor.send({
    type: 'NODE.CREATE_CONNECTED',
    nodeType,
    sourceNodeId,
  })
}

function handleNodeClick(e: NodeMouseEvent) {
  actor.send({ type: 'NODE.CLICK', nodeId: e.node.id })
}

function handleNodeDoubleClick(e: NodeMouseEvent) {
  actor.send({ type: 'NODE.DOUBLE_CLICK', nodeId: e.node.id })
}

function handleCloseNodeEditor() {
  actor.send({ type: 'NODE.EDITOR.CLOSE' })
}

function handleConnect(params: Connection) {
  actor.send({ type: 'EDGE.CONNECT', src: params.source, tgt: params.target })
}

function handleFlowClick(flow: Partial<FlowEntity>) {
  if (flow.id) {
    actor.send({ type: 'FLOW.SELECT', flowId: flow.id })
  }
}

function handleCreateFlow() {
  actor.send({ type: 'FLOW.CREATE' })
}

function openLabelDialog() {
  labelDialogOpen.value = true
}

function handleUpdateFlowLabel(label: string) {
  if (selectedFlowId.value && label) {
    actor.send({
      type: 'FLOW.UPDATE_LABEL',
      flowId: selectedFlowId.value,
      label: label
    })
    labelDialogOpen.value = false
  }
}

function handleOverlayClick() {
  if (selectedFlowId.value) {
    actor.send({ type: 'FLOW.SELECT', flowId: selectedFlowId.value })
  }
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' })
}

async function handleLayout(direction?: Direction) {
  const laidOutNodes = await layout(direction)
  
  // Update node positions in frontend state
  laidOutNodes.forEach(node => {
    if (node.id && node.position) {
      actor.send({
        type: 'NODE.UPDATE_POSITION',
        nodeId: node.id,
        position: { x: node.position.x, y: node.position.y }
      })
    }
  })
}

async function handleNodesInitialized() {
  // Check if all nodes already have positions defined
  const allNodesHavePositions = nodes.value.every(node => 
    positions.value[node.id] && 
    positions.value[node.id].x !== undefined && 
    positions.value[node.id].y !== undefined
  )
  
  // Only run auto-layout if some nodes don't have positions
  if (!allNodesHavePositions) {
    const laidOutNodes = await layout()
    
    // Update node positions in frontend state
    laidOutNodes.forEach(node => {
      if (node.id && node.position) {
        actor.send({
          type: 'NODE.UPDATE_POSITION',
          nodeId: node.id,
          position: { x: node.position.x, y: node.position.y }
        })
      }
    })
  }
}

function handleNodeUpdate(nodeId: string, updates: Record<string, any>) {
  actor.send({ type: 'NODE.UPDATE', nodeId: nodeId as any, updates })
}

function handleNodeDragStop(event: NodeMouseEvent) {
  const node = event.node
  if (node.id && node.position) {
    actor.send({
      type: 'NODE.UPDATE_POSITION',
      nodeId: node.id,
      position: { x: node.position.x, y: node.position.y }
    })
  }
}

function handleNodesRemove(nodes: { id: string }[]) {
  nodes.forEach(node => {
    actor.send({ 
      type: 'NODE.DELETE', 
      nodeId: node.id 
    })
  })
}

function handleSelectionChange(changes: { id: string; selected: boolean }[]) {
  // Find the first selected node (VueFlow supports multi-selection, but we only track one)
  const selectedChange = changes.find(change => change.selected);
  
  if (selectedChange) {
    // A node was selected
    actor.send({ 
      type: 'NODE.SELECTION_CHANGE', 
      nodeId: selectedChange.id,
      selected: true
    })
  } else {
    // All nodes were deselected
    const deselectedChange = changes.find(change => !change.selected);
    if (deselectedChange) {
      actor.send({ 
        type: 'NODE.SELECTION_CHANGE', 
        nodeId: '',
        selected: false
      })
    }
  }
}

function handleEdgesRemove(edges: { id: string }[]) {
  edges.forEach(edge => {
    actor.send({ 
      type: 'EDGE.DISCONNECT', 
      edgeId: edge.id 
    })
  })
}

function handleEdgeUpdate(event: EdgeUpdateEvent) {
  // Edge update event fires when an edge is successfully reconnected
  const { edge, connection } = event
  
  // Only send update if the connection actually changed
  if (edge.source !== connection.source || edge.target !== connection.target) {
    actor.send({
      type: 'EDGE.RECONNECT',
      edgeId: edge.id,
      oldSource: edge.source,
      oldTarget: edge.target,
      newSource: connection.source!,
      newTarget: connection.target!,
    })
  }
}

function handleEdgeUpdateEnd(event: EdgeMouseEvent) {
  // This event fires when edge dragging ends, whether successful or not
  // Vue Flow handles the visual state automatically
}
</script>

<style>

</style>
