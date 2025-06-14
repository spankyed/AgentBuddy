<template>
  <div class="relative flex w-full h-full overflow-hidden">
    <!-- ▸ Node palette (left) -->
    <aside class="overflow-y-auto text-white w-60 bg-neutral-800 scrollbar-thin">
      <!-- Flows list view -->
      <div v-if="inListState" class="flex flex-col h-full p-0 overflow-hidden">
        <!-- Root flow section -->
        <div v-if="rootFlow" class="flex flex-shrink-0 px-3 pt-5">
          <div class="flex items-center flex-shrink-0 mr-3 text-neutral-500">
            <span class="text-[10px] font-medium uppercase tracking-wider pl-2 mr-1">Root</span>
            <ArrowRightFromLine 
              class="transition-colors group-hover:text-primary-4300" 
              :size="13" 
            />
          </div>
          <button
            class="w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-100 cursor-pointer text-sm transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98]"
            :class="{ 
              'bg-primary-500/20 text-primary-300 border border-primary-500/40 hover:bg-primary-500/30': rootFlow.id === selectedFlowId,
              'hover:bg-neutral-700': rootFlow.id !== selectedFlowId
            }"
            @click="onFlowClick(rootFlow)"
          >
            <div class="flex-1 min-w-0 text-left">
              <div class="font-medium truncate">{{ rootFlow.label || 'Main Flow' }}</div>
              <div v-if="rootFlow.description" class="text-xs text-neutral-400 truncate mt-0.5" :class="{ 'text-primary-200/70': rootFlow.id === selectedFlowId }">
                {{ rootFlow.description }}
              </div>
            </div>
          </button>
        </div>

        <!-- Sub flows section -->
        <div v-if="flows.length > 0 || isSearchMode" class="flex flex-col flex-1 min-h-0 px-3 pb-3 overflow-hidden">
          <!-- Section divider -->
          <div v-if="rootFlow" class="flex items-center gap-2 mt-3 mb-4">
            <span class="text-[10px] font-medium uppercase tracking-wider text-neutral-500 px-2">Sub-Flows</span>
            <div class="flex-1 h-px bg-gradient-to-l from-transparent to-neutral-600"></div>
          </div>
          
          <!-- Sub flows list -->
          <div class="flex-1 px-1 -mx-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
            <button
              v-for="flow in filteredFlows"
              :key="flow.id"
              class="w-full group flex items-center gap-3 mb-1 px-3 py-2 rounded-lg text-neutral-100 cursor-pointer text-sm transition-all duration-200 hover:bg-neutral-700 active:scale-[0.98]"
              :class="{ 
                'bg-primary-500/20 text-primary-300 border border-primary-500/40 hover:bg-primary-500/30': flow.id === selectedFlowId,
                'hover:bg-neutral-700': flow.id !== selectedFlowId
              }"
              @click="onFlowClick(flow)"
            >
              <div class="flex-shrink-0">
                <ChevronRight 
                  class="transition-colors text-neutral-300 group-hover:text-primary-400" 
                  :class="{ 'text-primary-400': flow.id === selectedFlowId }" 
                  :size="16" 
                />
              </div>
              <div class="flex-1 min-w-0 text-left">
                <div class="font-medium truncate">{{ flow.label || `Flow ${flow.id}` }}</div>
                <div v-if="flow.description" class="text-xs text-neutral-400 truncate mt-0.5" :class="{ 'text-primary-200/70': flow.id === selectedFlowId }">
                  {{ flow.description }}
                </div>
              </div>
            </button>
            
            <!-- No search results message -->
            <div v-if="isSearchMode && filteredFlows.length === 0 && searchQuery.trim()" class="flex flex-col items-center justify-center h-32 gap-2 py-8 text-center">
              <Search class="text-neutral-500" :size="20" />
              <p class="m-0 text-xs text-neutral-400">No flows match "{{ searchQuery }}"</p>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!rootFlow && flows.length === 0" class="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-700">
            <Workflow class="text-neutral-500" :size="24" />
          </div>
          <div>
            <p class="m-0 text-sm font-medium text-neutral-300">No flows yet</p>
            <p class="m-0 mt-1 text-xs text-neutral-500">Create your first flow to get started</p>
          </div>
        </div>

        <!-- Create new flow section -->
        <div class="flex-shrink-0 p-3">
          <!-- Default state: Create and Search buttons -->
          <div v-if="!isSearchMode" class="flex gap-2">
            <Button 
              class="flex-1 !text-sm !font-medium"
              @click="onCreateFlow"
            >
              <Plus :size="16" />
              <span>New Flow</span>
            </Button>
            <Button 
              variant="transparent"
              class="!px-2.5 !h-auto text-neutral-300 hover:text-white hover:bg-neutral-700" 
              @click="isSearchMode = true" 
              title="Search flows"
            >
              <Search :size="16" />
            </Button>
          </div>
          
          <!-- Search mode -->
          <div v-else class="flex items-center gap-2">
            <div class="relative flex-1">
              <Search class="absolute -translate-y-1/2 left-3 top-1/2 text-neutral-400" :size="14" />
              <input
                v-model="searchQuery"
                type="text"
                class="w-full py-2 pr-3 text-sm transition-all duration-200 border rounded-lg outline-none pl-9 bg-neutral-800 text-neutral-100 focus:border-primary-400/50 focus:bg-neutral-900"
                placeholder="Search flows..."
                autofocus
                @keyup.escape="isSearchMode = false; searchQuery = ''"
              />
            </div>
            <Button 
              variant="transparent" 
              class="!p-2 !h-auto text-neutral-300 hover:text-white hover:bg-neutral-700"
              @click="isSearchMode = false; searchQuery = ''"
            >
              <X :size="16" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Steps palette view -->
      <div v-if="inViewState" class="p-3">
        <div class="mb-3">
          <h3 class="text-xs font-medium tracking-wider uppercase text-neutral-400">Components</h3>
        </div>
        <div class="space-y-1">
          <button
            v-for="t in paletteItems"
            :key="t.type"
            class="w-full flex items-center gap-3 px-3 py-2 bg-neutral-900 border  rounded-lg text-neutral-100 cursor-grab text-sm transition-all duration-200 hover:bg-neutral-700 hover:border-neutral-600 hover:shadow-sm active:cursor-grabbing active:scale-[0.98]"
            draggable="true"
            @dragstart="(e) => onDragStart(e, t.type)"
          >
            <div class="w-1 h-1 rounded-full bg-neutral-500"></div>
            <span>{{ t.label }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- ▸ VueFlow canvas (center) -->
    <VueFlow
      :nodes="plainNodes"
      :edges="plainEdges"
      class="flex-1 bg-neutral-900"
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
        class="opacity-[0.15] hover:opacity-100 transition-opacity duration-200 bg-neutral-900 border border-neutral-700 rounded-lg"
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
        class="flex absolute top-0 right-0 w-2/5 h-full transform transition-transform duration-300 ease-in-out z-[6] overflow-y-auto overflow-x-hidden scrollbar-thin"
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
          class="w-full px-4 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg text-[#e0e0e0] text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]"
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
import { ArrowRightFromLine, GitBranch, Workflow, Plus, Search, X, ChevronRight } from 'lucide-vue-next'
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
  @apply bg-neutral-600 rounded;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-neutral-500;
}
</style>
