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
      :show-overlay="inListState"
      @node-click="handleNodeClick"
      @connect="handleConnect"
      @drop="handleDrop"
      @go-back="handleGoBack"
      @action-layout="handleLayout"
      @action-edit-label="openLabelDialog"
      @overlay-click="handleOverlayClick"
      @nodes-initialized="handleNodesInitialized"
    />

    <!-- ▸ Node form overlay -->
    <NodeForm
      :selected-node="selected"
      @close="handleCloseNodeEditor"
      @update-label="(nodeId, label) => handleNodeUpdate(nodeId, { label })"
      @update-config="(nodeId, config) => handleNodeUpdate(nodeId, config)"
      @update-node="(node) => node.id && handleNodeUpdate(node.id, node)"
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
import type { Connection, NodeMouseEvent, Node as VueFlowNode } from '@vue-flow/core'
import { useLayout, type Direction } from '@/plugins/flows/canvas/useLayout'
import { useNodeViewport } from '@/plugins/flows/canvas/useNodeViewport'
import type { FlowEntity, NodeEntity } from '@abuddy/api'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { applicationState } from '@/app'
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
const flows   = useSelector(actor, (s) => s.context.flows.filter((n) => n.id !== s.context.rootFlow?.id))
const rootFlow = useSelector(actor, (s) => s.context.rootFlow)
const selectedFlowId = useSelector(actor, (s) => s.context.selectedFlowId)
const selected = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.selectedNodeId)
) as Ref<NodeEntity | undefined>

const plainNodes = computed(() => {
  const mappedNodes = nodes.value
    .map((n) => ({
      id       : n.id!,
      type     : n.nodeType,
      position : { 
        x: n.x ?? 0,  // Use stored position or default to 0
        y: n.y ?? 0 
      },
      data     : n,  // The node itself is the data
    })) as VueFlowNode[]

  return mappedNodes
})

const plainEdges = computed(() =>
  Object.values(edges.value).map((e, idx) => ({
    id     : e.id,
    source : e.source,
    target : e.target,
    data: { kind: e.kind },
    animated: e.kind === 'responder',
  })),
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
  
  actor.send({
    type: 'NODE.CREATE',
    nodeType,
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

function handleCloseNodeEditor() {
  actor.send({ type: 'NODE.CLICK', nodeId: '' })
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

function handleNodeUpdate(nodeId: string, updates: any) {
  actor.send({ type: 'NODE.UPDATE', nodeId: nodeId as any, updates })
}
</script>

<style>

</style>
