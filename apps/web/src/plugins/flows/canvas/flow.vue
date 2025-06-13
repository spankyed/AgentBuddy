<template>
  <div class="relative flex w-full h-full overflow-hidden">
    <!-- ▸ Node palette (left) -->
    <aside class="w-60 overflow-y-auto bg-[#0a0a0a] text-white border-r border-[#1a1a1a]">
      <!-- Flows list view -->
      <div v-if="inListState" class="flex flex-col h-full p-0 overflow-hidden">
        <!-- Root flow section -->
        <div v-if="rootFlow" class="flex-shrink-0 px-4 pt-6">
          <!-- <h3 class="section-title">Root Flow</h3> -->
          <button
            class="flow-item root-flow"
            :class="{ active: rootFlow.id === selectedFlowId }"
            @click="onFlowClick(rootFlow)"
          >
            <div class="flex items-center min-w-0 gap-2">
              <ArrowRightFromLine class="flex-shrink-0 text-cyan-400" :size="16" />
              <span class="text-sm font-medium leading-tight truncate">{{ rootFlow.label || 'Root Flow' }}</span>
            </div>
            <span v-if="rootFlow.description" class="ml-6 text-xs leading-relaxed text-neutral-500">{{ rootFlow.description }}</span>
          </button>
        </div>

        <!-- Other flows section -->
        <div v-if="flows.length > 0" class="flex flex-col flex-1 min-h-0 px-4 pb-4 overflow-hidden">
          <div v-if="rootFlow" class="section-title-container">
            <h3 class="section-title">Sub Flows</h3>
          </div>
          <div class="flex-1 pr-1 overflow-x-hidden overflow-y-auto flows-grid">
            <button
              v-for="flow in flows"
              :key="flow.id"
              class="flow-item"
              :class="{ active: flow.id === selectedFlowId }"
              @click="onFlowClick(flow)"
            >
              <div class="flex items-center min-w-0 gap-2">
                <GitBranch class="flex-shrink-0 text-cyan-400" :size="14" />
                <span class="text-sm font-medium leading-tight truncate">{{ flow.label || `Flow ${flow.id}` }}</span>
              </div>
              <span v-if="flow.description" class="ml-6 text-xs leading-relaxed text-neutral-500">{{ flow.description }}</span>
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!rootFlow && flows.length === 0" class="flex flex-col items-center justify-center h-full gap-3 px-4 py-12 text-center">
          <Workflow class="text-neutral-700" :size="32" />
          <p class="m-0 text-sm text-neutral-500">No flows created yet</p>
        </div>

        <!-- Create new flow button -->
        <div class="create-flow-section">
          <button class="create-flow-button" @click="onCreateFlow">
            <Plus class="flex-shrink-0" :size="18" />
            <span>Create New Flow</span>
          </button>
        </div>
      </div>

      <!-- Steps palette view -->
      <div v-if="inViewState" class="p-6">
        <button
          v-for="t in paletteItems"
          :key="t.type"
          class="block w-full mb-2 px-3.5 py-2.5 bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] cursor-grab text-left text-sm transition-all duration-200 relative hover:bg-[#1a1a1a] hover:border-[#333] hover:translate-x-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)] active:cursor-grabbing active:scale-[0.98]"
          draggable="true"
          @dragstart="(e) => onDragStart(e, t.type)"
        >
          {{ t.label }}
        </button>
      </div>
    </aside>

    <!-- ▸ VueFlow canvas (center) -->
    <VueFlow
      :nodes="plainNodes"
      :edges="plainEdges"
      class="flex-1 bg-[#0a0a0a]"
      :fit-view-on-init="true"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-edge-options="{
        type: 'generic',
        style: { strokeWidth: 2 },
        markerEnd: MarkerType.Arrow
      }"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :connect-on-click="true"
      @node-click="onNodeClick"
      @connect="onConnect"
      @drop="onDrop"
      @dragover.prevent
      @nodes-initialized="layout()"
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
      <MiniMap :maskColor="'#26262650'" :maskStrokeColor="'transparent'" />

      <!-- Actions menu (top left) -->
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <button class="absolute left-2.5 top-2.5 z-[4] w-10 h-10 flex items-center justify-center bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] cursor-pointer transition-all duration-200 hover:bg-[#1a1a1a] hover:border-[#333] hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]" title="Actions menu">
            <MoreVertical :size="20" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="bg-[#161616] border border-[#262626] rounded-lg p-1 min-w-[180px] shadow-[0_10px_38px_-10px_rgba(0,0,0,0.75),0_10px_20px_-15px_rgba(0,0,0,0.4)]" :side="'bottom'" :side-offset="8">
            <DropdownMenuItem class="flex items-center gap-2 px-3 py-2 rounded text-[#e0e0e0] text-sm cursor-pointer outline-none transition-all duration-200 hover:bg-[#262626] focus:bg-[#262626]" @select="() => layout('LR')">
              <Layout :size="16" class="flex-shrink-0 text-cyan-400" />
              Auto Layout
            </DropdownMenuItem>
            <DropdownMenuItem 
              v-if="selectedFlowId" 
              class="flex items-center gap-2 px-3 py-2 rounded text-[#e0e0e0] text-sm cursor-pointer outline-none transition-all duration-200 hover:bg-[#262626] focus:bg-[#262626]" 
              @select="openLabelDialog"
            >
              <Edit :size="16" class="flex-shrink-0 text-cyan-400" />
              Edit Label
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

  </VueFlow>

    <!-- ▸ Node editor overlay -->
      <!-- Backdrop overlay -->
      <div v-if="selected" class="absolute top-0 left-0 w-full h-full bg-black/70 z-[5]" @click="closeNodeEditor" />
      <!-- Slide-in form -->
      <div class="slide-in-form" :class="{ 'is-open': selected }">
        <component
          v-if="selected"
          :is="getFormComponent(selected.nodeType)"
          :node="selected"
        />
      </div>

    <!-- Label Edit Dialog -->
    <Dialog
      v-model="labelDialogOpen"
      title="Edit Flow Label"
      description="Update the label for the current flow."
      @cancel="labelDialogOpen = false"
    >
      <form id="label-form" @submit.prevent="updateFlowLabel" class="flex flex-col gap-4">
        <input
          v-model="newFlowLabel"
          type="text"
          class="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-cyan-400 focus:shadow-[0_0_0_2px_rgba(0,188,212,0.1)]"
          placeholder="Enter flow label"
          autofocus
        />
      </form>
      
      <template #actions>
        <button type="button" class="dialog-button cancel" @click="labelDialogOpen = false">
          Cancel
        </button>
        <button type="submit" class="dialog-button submit" form="label-form">
          Save
        </button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, type Ref, ref } from 'vue'
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  useVueFlow,
  ConnectionMode,
} from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode } from '@vue-flow/core'
import { useLayout } from '@/plugins/flows/canvas/useLayout'
import type { FlowEntity, NodeEntity } from '@abuddy/api'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ArrowRightFromLine, GitBranch, Workflow, Plus, Layout, Edit, MoreVertical } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from 'reka-ui'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { applicationState } from '@/app'
import {
  id,
  type FlowsState,
} from '@/plugins/flows/state'
import { useSelector } from '@xstate/vue'

import GenericEdge from './edges/GenericEdge.vue'
import { nodeTypes, nodeConnectionRules } from './nodes'

// Form components
import BaseForm from './forms/BaseForm.vue'
import ListenForm from './forms/ListenForm.vue'
import FireForm from './forms/FireForm.vue'
import CreateForm from './forms/CreateForm.vue'

// Design components
import Dialog from '@/core/design/dialog.vue'

const { layout } = useLayout()

// Dialog state
const labelDialogOpen = ref(false)
const newFlowLabel = ref('')

function getFormComponent(nodeType: string) {
  const formMap: Record<string, any> = {
    'listen': ListenForm,
    'fire': FireForm,
    'create': CreateForm,
  }
  return formMap[nodeType] || BaseForm
}

/* ------------------------------------------------------------ */
/*  reactive state from the actor                               */
/* ------------------------------------------------------------ */
const actor: FlowsState = applicationState.system.get(id)

const inListState = useSelector(actor, (s) => s.hasTag('list-flows'))
const inViewState = useSelector(actor, (s) => s.hasTag('view-flow'))
const nodes   = useSelector(actor, (s) => s.context.graph.nodes)
const edges   = useSelector(actor, (s) => s.context.graph.edges)
const logs    = useSelector(actor, (s) => s.context.logs)
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
      position : { x: n.x ?? 0, y: n.y ?? 0 },
      data     : n,  // The node itself is the data
    })) as VueFlowNode[]

  return mappedNodes
})

const plainEdges = computed(() =>
  Object.values(edges.value).map((e, idx) => ({
    // id: `${e.id}-${idx}`,
    id     : e.id,
    source : e.source,
    target : e.target,
    // sourceHandle: `${e.source}-right`,  // connect to    handle of source node
    // targetHandle: `${e.target}-top`,     // connect to top handle of target node
    // type   : 'generic',                  // handled by slot above
    data: { kind: e.kind },
    animated: e.kind === 'consumed_by',
  })),
)

/* ------------------------------------------------------------ */
/*  palette + drag helpers                                      */
/* ------------------------------------------------------------ */
const paletteItems = [
  { type: 'flow', label: 'Flow' },
  { type: 'listen', label: 'Listen' },
  { type: 'fire', label: 'Fire' },
  { type: 'action', label: 'Action' },
  { type: 'create', label: 'Create' },
  { type: 'update', label: 'Update' },
  { type: 'query', label: 'Query' },
  { type: 'decision', label: 'Decision' },
  { type: 'transform', label: 'Transform' },
]

function onDragStart (e: DragEvent, nodeType: string) {
  e.dataTransfer?.setData('application/vueflow', nodeType)
  e.dataTransfer!.effectAllowed = 'move'
}

function onDrop (e: DragEvent) {
  const nodeType = e.dataTransfer?.getData('application/vueflow')
  if (!nodeType) return
  const bounds = (e.target as HTMLElement).getBoundingClientRect()
  actor.send({
    type: 'NODE.DRAG_CREATE',
    nodeType,
    x: e.clientX - bounds.left,
    y: e.clientY - bounds.top,
  })
}

/* ------------------------------------------------------------ */
/*  canvas event handlers                                       */
/* ------------------------------------------------------------ */
function onNodeClick (e: NodeMouseEvent) {
  actor.send({ type: 'NODE.CLICK', nodeId: e.node.id })
}

function closeNodeEditor() {
  actor.send({ type: 'NODE.CLICK', nodeId: '' })
}

function onConnect (params: Connection) {
  actor.send({ type: 'EDGE.CONNECT', src: params.source, tgt: params.target })
}

function onFlowClick(flow: Partial<FlowEntity>) {
  if (flow.id) {
    actor.send({ type: 'FLOW.SELECT', flowId: flow.id })
  }
}

function onCreateFlow() {
  actor.send({ type: 'FLOW.CREATE' })
}

function openLabelDialog() {
  const currentFlow = rootFlow.value?.id === selectedFlowId.value 
    ? rootFlow.value 
    : flows.value.find(f => f.id === selectedFlowId.value)
  
  if (currentFlow) {
    newFlowLabel.value = currentFlow.label || ''
    labelDialogOpen.value = true
  }
}

function updateFlowLabel() {
  if (selectedFlowId.value && newFlowLabel.value.trim()) {
    actor.send({
      type: 'FLOW.UPDATE_LABEL',
      flowId: selectedFlowId.value,
      label: newFlowLabel.value.trim()
    })
    labelDialogOpen.value = false
  }
}
</script>

<style scoped>
/* Section title with bisecting line */
.section-title {
  @apply m-0 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 bg-[#0a0a0a] px-3;
}

.section-title-container {
  @apply relative flex items-center justify-center my-4;
}

.section-title-container::before {
  content: '';
  @apply absolute left-0 right-0 top-1/2 h-px z-0;
  background: linear-gradient(to right, transparent, #333 20%, #333 80%, transparent);
}

.section-title-container .section-title {
  @apply relative z-[1];
}

/* Flow items with gradients */
.flow-item {
  @apply flex flex-col gap-1.5 w-full mb-2 px-3.5 py-3 bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] cursor-pointer text-left transition-all duration-200 relative overflow-hidden;
}

.flow-item::before {
  content: '';
  @apply absolute top-0 left-0 right-0 bottom-0 opacity-0 transition-opacity duration-300;
  background: radial-gradient(circle at top left, rgba(0, 188, 212, 0.05), transparent 50%);
}

.flow-item:hover {
  @apply bg-[#1a1a1a] border-[#333] -translate-y-px shadow-[0_4px_12px_rgba(0,0,0,0.5)];
}

.flow-item:hover::before {
  @apply opacity-100;
}

/* Root flow styling */
.flow-item.root-flow {
  background: linear-gradient(135deg, #1a1a1a 0%, #161616 100%);
  @apply border-[#2a2a2a];
}

.flow-item.root-flow:hover {
  background: linear-gradient(135deg, #1f1f1f 0%, #1a1a1a 100%);
  @apply border-cyan-400;
  box-shadow: 0 0 0 1px rgba(0, 188, 212, 0.1), 0 6px 16px rgba(0, 0, 0, 0.6);
}

/* Active flow styling */
.flow-item.active {
  background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  @apply border-cyan-400 text-white;
  box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2), 0 4px 12px rgba(0, 188, 212, 0.3);
}

.flow-item.active .text-cyan-400 {
  @apply text-white;
}

.flow-item.active .text-neutral-500 {
  @apply text-white/80;
}

/* Minimap styling */
:deep(.vue-flow__minimap) {
  @apply opacity-[0.15] transition-opacity duration-200 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg;
}

:deep(.vue-flow__minimap:hover) {
  @apply opacity-100;
}

/* Slide-in form */
.slide-in-form {
  @apply flex absolute top-0 right-0 w-2/5 h-full border-l border-[#333] transform translate-x-full transition-transform duration-300 ease-in-out z-[6] overflow-y-auto overflow-x-hidden;
}

.slide-in-form.is-open {
  @apply translate-x-0;
}

/* Scrollbar styling */
*::-webkit-scrollbar {
  @apply w-1.5;
}

*::-webkit-scrollbar-track {
  @apply bg-transparent;
}

*::-webkit-scrollbar-thumb {
  @apply bg-neutral-700 rounded-[3px];
}

*::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-600;
}

/* Create flow button section */
.create-flow-section {
  @apply flex-shrink-0 p-4 border-t border-[#1a1a1a];
  background: linear-gradient(to top, #0a0a0a 0%, rgba(10, 10, 10, 0.95) 50%, rgba(10, 10, 10, 0) 100%);
}

.create-flow-button {
  @apply flex items-center justify-center w-full px-5 py-3 rounded-lg text-white cursor-pointer text-sm font-medium transition-all duration-200 gap-2;
  background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  @apply border border-cyan-400;
}

.create-flow-button:hover {
  background: linear-gradient(135deg, #00d4e6 0%, #00acc1 100%);
  @apply border-[#00d4e6] shadow-[0_4px_12px_rgba(0,188,212,0.3)] -translate-y-px;
}

.create-flow-button:active {
  @apply translate-y-0 shadow-[0_2px_8px_rgba(0,188,212,0.3)];
}
</style>
