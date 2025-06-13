<template>
  <div class="relative flex w-full h-full overflow-hidden">
    <!-- ▸ Node palette (left) -->
    <aside class="w-60 overflow-y-auto bg-[#0a0a0a] text-white border-r border-[#1a1a1a] scrollbar-thin">
      <!-- Flows list view -->
      <div v-if="inListState" class="flex flex-col h-full p-0 overflow-hidden">
        <!-- Root flow section -->
        <div v-if="rootFlow" class="flex-shrink-0 px-4 pt-4">
          <button
            class="w-full flex flex-col gap-1 px-4 py-2 bg-gradient-to-br from-[#1a1a1a] to-[#161616] border border-[#2a2a2a] rounded-lg text-[#e0e0e0] cursor-pointer text-left text-sm transition-all duration-200 hover:from-[#1f1f1f] hover:to-[#1a1a1a] hover:border-cyan-400 hover:shadow-[0_0_0_1px_rgba(0,188,212,0.1),0_6px_16px_rgba(0,0,0,0.6)] active:scale-[0.98]"
            :class="{ 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-400 text-white shadow-[0_0_0_2px_rgba(0,188,212,0.2),0_4px_12px_rgba(0,188,212,0.3)]': rootFlow.id === selectedFlowId }"
            @click="onFlowClick(rootFlow)"
          >
            <div class="flex items-center min-w-0 gap-2">
              <ArrowRightFromLine class="flex-shrink-0 text-cyan-400" :class="{ 'text-white': rootFlow.id === selectedFlowId }" :size="14" />
              <span class="font-medium leading-tight truncate">{{ rootFlow.label || 'Root Flow' }}</span>
            </div>
            <span v-if="rootFlow.description" class="ml-6 text-xs leading-relaxed text-neutral-500" :class="{ 'text-white/80': rootFlow.id === selectedFlowId }">{{ rootFlow.description }}</span>
          </button>
        </div>

        <!-- Other flows section -->
        <div v-if="flows.length > 0 || isSearchMode" class="flex flex-col flex-1 min-h-0 px-4 pb-4 overflow-hidden">
          <div v-if="rootFlow" class="relative flex items-center justify-center my-3">
            <!-- Bisecting line -->
            <div class="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#777] to-transparent"></div>
            <span class="flex items-center z-[1] bg-[#0a0a0a] px-1">
              <GitBranch class="flex-shrink-0 text-cyan-400" :size="12" />
            </span>
            <h3 class="m-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 bg-[#0a0a0a] pl-2 pr-3 z-[1]">Sub Flows</h3>
          </div>
          <div class="flex-1 pr-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
            <button
              v-for="flow in filteredFlows"
              :key="flow.id"
              class="w-full flex flex-col gap-1 mb-1.5 px-4 py-2 bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] cursor-pointer text-left text-sm transition-all duration-200 relative overflow-hidden hover:bg-[#1a1a1a] hover:border-[#333] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.5)] active:scale-[0.98]"
              :class="{ 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-400 text-white shadow-[0_0_0_2px_rgba(0,188,212,0.2),0_4px_12px_rgba(0,188,212,0.3)]': flow.id === selectedFlowId }"
              @click="onFlowClick(flow)"
            >
              <div class="flex items-center min-w-0 gap-2">
                <span class="font-medium leading-tight truncate">{{ flow.label || `Flow ${flow.id}` }}</span>
              </div>
              <span v-if="flow.description" class="text-xs leading-relaxed text-neutral-500" :class="{ 'text-white/80': flow.id === selectedFlowId }">{{ flow.description }}</span>
            </button>
            <!-- No search results message -->
            <div v-if="isSearchMode && filteredFlows.length === 0 && searchQuery.trim()" class="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <Search class="text-neutral-600" :size="20" />
              <p class="m-0 text-sm text-neutral-500">No flows match "{{ searchQuery }}"</p>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!rootFlow && flows.length === 0" class="flex flex-col items-center justify-center h-full gap-3 px-4 py-12 text-center">
          <Workflow class="text-neutral-700" :size="28" />
          <p class="m-0 text-sm text-neutral-500">No flows created yet</p>
        </div>

        <!-- Create new flow button -->
        <div class="flex-shrink-0 p-4 border-t border-[#1a1a1a] bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent">
          <!-- Default state: Create and Search buttons -->
          <div v-if="!isSearchMode" class="flex gap-2">
            <Button 
              class="py-4 flex-1 bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 border border-cyan-400 hover:border-cyan-300 hover:shadow-[0_4px_12px_rgba(0,188,212,0.3)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,188,212,0.3)]"
              @click="onCreateFlow"
            >
              <Plus class="flex-shrink-0" :size="16" />
              <span>New Flow</span>
            </Button>
            <Button 
              class="!px-2.5 !h-auto bg-gradient-to-br from-[#262626] to-[#1a1a1a] hover:from-[#333] hover:to-[#262626] border border-[#333] hover:border-[#444] hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_2px_8px_rgba(0,0,0,0.3)]" 
              @click="isSearchMode = true" 
              title="Search flows"
            >
              <Search :size="16" />
            </Button>
          </div>
          
          <!-- Search mode: Search input and controls -->
          <div v-else class="flex items-center gap-2">
            <input
              v-model="searchQuery"
              type="text"
              class="w-full min-w-0 px-4 py-2 bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-cyan-400 focus:shadow-[0_0_0_2px_rgba(0,188,212,0.1)]"
              placeholder="Search flows..."
              autofocus
              @keyup.escape="isSearchMode = false; searchQuery = ''"
            />
            <Button 
              variant="transparent" 
              class="!p-2 !h-auto !text-sm text-neutral-400 hover:text-white bg-[#161616] border border-[#262626] hover:bg-[#1a1a1a] hover:border-[#333]"
              @click="isSearchMode = false; searchQuery = ''"
            >
              <X :size="16" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Steps palette view -->
      <div v-if="inViewState" class="p-4">
        <button
          v-for="t in paletteItems"
          :key="t.type"
          class="block w-full mb-1.5 px-4 py-2 bg-[#161616] border border-[#262626] rounded-lg text-[#e0e0e0] cursor-grab text-left text-sm transition-all duration-200 relative hover:bg-[#1a1a1a] hover:border-[#333] hover:translate-x-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)] active:cursor-grabbing active:scale-[0.98]"
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
      <MiniMap 
        :maskColor="'#26262650'" 
        :maskStrokeColor="'transparent'" 
        class="opacity-[0.15] hover:opacity-100 transition-opacity duration-200 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg"
      />

      <!-- Actions menu (top left) -->
      <FlowActionsMenu 
        :selected-flow-id="selectedFlowId"
        @layout="(direction) => layout(direction)"
        @edit-label="openLabelDialog"
      />

    </VueFlow>

    <!-- ▸ Node editor overlay -->
      <!-- Backdrop overlay -->
      <div v-if="selected" class="absolute top-0 left-0 w-full h-full bg-black/70 z-[5]" @click="closeNodeEditor" />
      <!-- Slide-in form -->
      <div 
        class="flex absolute top-0 right-0 w-2/5 h-full border-l border-[#333] transform transition-transform duration-300 ease-in-out z-[6] overflow-y-auto overflow-x-hidden scrollbar-thin"
        :class="selected ? 'translate-x-0' : 'translate-x-full'"
      >
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
          class="w-full px-4 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-cyan-400 focus:shadow-[0_0_0_2px_rgba(0,188,212,0.1)]"
          placeholder="Enter flow label"
          autofocus
        />
      </form>
      
      <template #actions>
        <Button variant="secondary" @click="labelDialogOpen = false">
          Cancel
        </Button>
        <Button type="submit" form="label-form">
          Save
        </Button>
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
import { ArrowRightFromLine, GitBranch, Workflow, Plus, Search, X } from 'lucide-vue-next'
import uFuzzy from '@leeoniya/ufuzzy'

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
import FlowActionsMenu from './FlowActionsMenu.vue'
import Button from '@/core/design/button.vue'

const { layout } = useLayout()

// Dialog state
const labelDialogOpen = ref(false)
const newFlowLabel = ref('')

// Search state
const isSearchMode = ref(false)
const searchQuery = ref('')

// Initialize uFuzzy instance
const fuzzy = new uFuzzy({
  intraMode: 1,  // Allows typos within terms
  interLft: 2,   // Allows fuzziness between terms
  intraSub: 1,   // Allows substitutions
  intraTrn: 1,   // Allows transpositions
  intraDel: 1,   // Allows deletions
  intraIns: 1    // Allows insertions
})

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

// Filtered flows based on search query
const filteredFlows = computed(() => {
  if (!searchQuery.value.trim()) {
    return flows.value
  }
  
  // Create haystack - array of searchable strings
  const haystack = flows.value.map(flow => {
    const label = flow.label || `Flow ${flow.id}`
    const description = flow.description || ''
    return `${label} ${description}`.toLowerCase()
  })
  
  // Perform fuzzy search
  const idxs = fuzzy.search(haystack, searchQuery.value.toLowerCase())
  
  if (!idxs) {
    return []
  }
  
  // Get the matched flows
  const [matchedIndexes, info, order] = idxs
  
  // Return flows in the order suggested by uFuzzy
  return order.map(i => flows.value[matchedIndexes[i]])
})

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

<style>
/* Custom scrollbar styling */
.scrollbar-thin::-webkit-scrollbar {
  @apply w-1.5;
}

.scrollbar-thin::-webkit-scrollbar-track {
  @apply bg-transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-neutral-700 rounded;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-600;
}
</style>
