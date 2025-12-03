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
        @flow-click="handleFlowPreview"
        @flow-dblclick="handleFlowClick"
        @create-flow="handleCreateFlow"
        @request-delete="openDeleteDialog"
        @request-edit-label="openEditDialog"
      />

      <!-- Steps palette view -->
      <NodePalette
        v-if="inViewState"
        @palette-click="handlePaletteClick"
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
      @action-edit-label="openEditDialog"
      @request-delete-flow="() => currentFlow && openDeleteDialog(currentFlow)"
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
      @cancel="() => { labelDialogOpen = false; targetFlow = null }"
      @save="handleUpdateLabel"
    />

    <!-- Centralized Delete Confirmation Dialog -->
    <ConfirmationDialog
      v-model="deleteDialogOpen"
      title="Delete Flow"
      :description="`Are you sure you want to delete '${targetFlow?.label || 'this flow'}'? This action cannot be undone. All nodes and connections in this flow will be permanently deleted.`"
      confirm-text="Delete Flow"
      cancel-text="Cancel"
      variant="danger"
      @confirm="handleConfirmDelete"
      @cancel="handleCancelDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type Ref, ref, nextTick, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode, Edge, EdgeUpdateEvent, EdgeMouseEvent } from '@vue-flow/core'
import { calculateLayoutAsync, type LayoutDirection } from '@/plugins/flows/canvas/layout-utils'
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
import ConfirmationDialog from '@/core/components/design/ConfirmationDialog.vue'

const { project, fitView } = useVueFlow()

// Dialog state
const labelDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const targetFlow = ref<Partial<FlowEntity> | null>(null)

/* ------------------------------------------------------------ */
/*  reactive state from the actor                               */
/* ------------------------------------------------------------ */
const actor: FlowsState = applicationState.system.get(id)

const inListState = useSelector(actor, (s) => s.hasTag('list-flows'))
const inViewState = useSelector(actor, (s) => s.hasTag('view-flow'))
const nodes   = useSelector(actor, (s) => s.context.graph.nodes)
const edges   = useSelector(actor, (s) => s.context.graph.edges)
const settings = useSelector(actor, (s) => s.context.settings)
const allFlows = useSelector(actor, (s) => s.context.flows)
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

// Watch for position changes and re-center view after layout is computed
watch(positions, (newPositions) => {
  if (Object.keys(newPositions).length > 0) {
    nextTick(() => fitView())
  }
}, { once: true })

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
  Object.values(edges.value).map((e) => {
    // Find the source node to check if it's an event node
    const sourceNode = nodes.value.find(n => n.id === e.source)
    const isFromEventNode = sourceNode?.nodeType === 'listen'

    return {
      id     : e.id,
      source : e.source,
      target : e.target,
      sourceHandle: e.sourceHandle,  // For switch nodes with multiple outputs
      targetHandle: e.targetHandle,  // For nodes with multiple inputs
      data: { kind: e.kind },
      animated: e.kind === 'transitions_to' && isFromEventNode,
    }
  }),
)

const currentFlow = computed(() =>
  allFlows.value.find(f => f.id === selectedFlowId.value)
)

const currentFlowLabel = computed(() =>
  currentFlow.value?.label || (currentFlow.value?.id === rootFlow.value?.id ? 'Main Flow' : '')
)

/* ------------------------------------------------------------ */
/*  Event handlers                                              */
/* ------------------------------------------------------------ */

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
  actor.send({
    type: 'EDGE.CONNECT',
    src: params.source,
    tgt: params.target,
    sourceHandle: params.sourceHandle || undefined,
    targetHandle: params.targetHandle || undefined,
  })
}

function handleFlowPreview(flow: Partial<FlowEntity>) {
  if (!flow.id) return

  const enablePreview = settings.value?.enableFlowPreview ?? true
  const isAlreadySelected = selectedFlowId.value === flow.id
  const shouldOpenEditor = !enablePreview || isAlreadySelected

  actor.send({
    type: shouldOpenEditor ? 'FLOW.SELECT' : 'FLOW.PREVIEW',
    flowId: flow.id
  })
}

function handleFlowClick(flow: Partial<FlowEntity>) {
  if (flow.id) actor.send({ type: 'FLOW.SELECT', flowId: flow.id })
}

function handleCreateFlow() {
  actor.send({ type: 'FLOW.CREATE' })
}

// Unified dialog handlers
function openEditDialog(flow?: Partial<FlowEntity>) {
  targetFlow.value = flow || currentFlow.value || null
  if (targetFlow.value) labelDialogOpen.value = true
}

function openDeleteDialog(flow: Partial<FlowEntity>) {
  if (flow.id === rootFlow.value?.id) return
  targetFlow.value = flow
  deleteDialogOpen.value = true
}

const handleUpdateLabel = (label: string) => {
  if (!targetFlow.value?.id || !label) return

  actor.send({ type: 'FLOW.UPDATE_LABEL', flowId: targetFlow.value.id, label })
  labelDialogOpen.value = false
  targetFlow.value = null
}

const handleConfirmDelete = () => {
  if (!targetFlow.value?.id) return

  actor.send({ type: 'FLOW.DELETE', flowId: targetFlow.value.id })
  targetFlow.value = null
}

const handleCancelDelete = () => targetFlow.value = null

function handleOverlayClick() {
  if (selectedFlowId.value) actor.send({ type: 'FLOW.SELECT', flowId: selectedFlowId.value })
}

function handleGoBack() {
  actor.send({ type: 'GO.BACK' })
}

async function handleLayout(direction?: LayoutDirection) {
  // Calculate new positions using async ELK layout
  const newPositions = await calculateLayoutAsync(
    { nodes: nodes.value, edges: edges.value },
    { direction }
  )

  // Save all positions to state
  for (const [nodeId, pos] of Object.entries(newPositions)) {
    actor.send({
      type: 'NODE.UPDATE_POSITION',
      nodeId,
      position: pos
    })
  }

  await nextTick()
  fitView()
}

async function handleNodesInitialized() {
  // Layout is calculated BEFORE render in XState actions (loadFlowData, addCreatedFlow)
  // This handler only needs to center the view
  await nextTick()
  fitView()
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
  for (const node of nodes) {
    actor.send({ type: 'NODE.DELETE', nodeId: node.id })
  }
}

function handleSelectionChange(changes: { id: string; selected: boolean }[]) {
  const selectedChange = changes.find(change => change.selected)
  const deselectedChange = changes.find(change => !change.selected)

  if (selectedChange) {
    actor.send({ type: 'NODE.SELECTION_CHANGE', nodeId: selectedChange.id, selected: true })
  } else if (deselectedChange) {
    actor.send({ type: 'NODE.SELECTION_CHANGE', nodeId: '', selected: false })
  }
}

function handleEdgesRemove(edges: { id: string }[]) {
  for (const edge of edges) {
    actor.send({ type: 'EDGE.DISCONNECT', edgeId: edge.id })
  }
}

function handleEdgeUpdate(event: EdgeUpdateEvent) {
  const { edge, connection } = event

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
  // Vue Flow handles the visual state automatically
}
</script>

<style>

</style>
