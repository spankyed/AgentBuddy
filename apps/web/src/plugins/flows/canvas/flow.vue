<template>
  <div class="dialog-editor">
    <!-- ▸ Node palette (left) -->
    <aside class="palette">
      <!-- Flows list view -->
      <div v-if="inListState" class="flows-list">
        <!-- Root flow section -->
        <div v-if="rootFlow" class="flow-section root-section">
          <h3 class="section-title">Main Flow</h3>
          <button
            class="flow-item root-flow"
            :class="{ active: rootFlow.id === selectedFlowId }"
            @click="onFlowClick(rootFlow)"
          >
            <div class="flow-header">
              <Home class="flow-icon" :size="16" />
              <span class="flow-name">{{ rootFlow.label || 'Root Flow' }}</span>
            </div>
            <span v-if="rootFlow.description" class="flow-description">{{ rootFlow.description }}</span>
          </button>
        </div>

        <!-- Divider -->
        <div v-if="rootFlow && flows.length > 0" class="section-divider"></div>

        <!-- Other flows section -->
        <div v-if="flows.length > 0" class="flow-section subflows-section">
          <h3 class="section-title">Sub Flows</h3>
          <div class="flows-grid">
            <button
              v-for="flow in flows"
              :key="flow.id"
              class="flow-item"
              :class="{ active: flow.id === selectedFlowId }"
              @click="onFlowClick(flow)"
            >
              <div class="flow-header">
                <GitBranch class="flow-icon" :size="14" />
                <span class="flow-name">{{ flow.label || `Flow ${flow.id}` }}</span>
              </div>
              <span v-if="flow.description" class="flow-description">{{ flow.description }}</span>
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!rootFlow && flows.length === 0" class="empty-state">
          <Workflow class="empty-icon" :size="32" />
          <p>No flows created yet</p>
        </div>

        <!-- Create new flow button -->
        <div class="create-flow-section">
          <button class="create-flow-button" @click="onCreateFlow">
            <Plus class="create-icon" :size="18" />
            <span>Create New Flow</span>
          </button>
        </div>
      </div>

      <!-- Steps palette view -->
      <div v-if="inViewState" class="steps-palette">
        <button
          v-for="t in paletteItems"
          :key="t.type"
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
      class="graph"
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
      <button
        class="layout-button"
        @click="() => layout('LR')"
        title="Auto-layout graph"
      >
        Layout
      </button>
      <MiniMap :maskColor="'#26262650'" :maskStrokeColor="'transparent'" />

  </VueFlow>

    <!-- ▸ Node editor overlay -->
      <!-- Backdrop overlay -->
      <div v-if="selected" class="backdrop-overlay" @click="closeNodeEditor" />
      <!-- Slide-in form -->
      <div class="slide-in-form" :class="{ 'is-open': selected }">
        <component
          v-if="selected"
          :is="getFormComponent(selected.nodeType)"
          :node="selected"
        />
      </div>
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
import type { Connection, NodeMouseEvent, Edge, Node as VueFlowNode } from '@vue-flow/core'
import type { Direction } from '@/plugins/flows/canvas/useLayout'
import { useLayout } from '@/plugins/flows/canvas/useLayout'
import type { FlowEntity, NodeEntity } from '@abuddy/api'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { Home, GitBranch, Workflow, Plus } from 'lucide-vue-next'

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

const { layout } = useLayout()

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
const flows   = useSelector(actor, (s) => s.context.flows)
const rootFlow = useSelector(actor, (s) => s.context.rootFlow)
const selectedFlowId = useSelector(actor, (s) => s.context.selectedFlowId)
const selected = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.selectedNodeId)
) as Ref<NodeEntity | undefined>

/* Transform nodes and edges for Vue-Flow */
const plainNodes = computed(() => {
  const mappedNodes = nodes.value.map((n) => ({
    /* 1‑to‑1 mapping – only Vue‑Flow‑required props added */
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
  // TODO: Implement flow creation logic
  console.log('Create new flow clicked')
  // actor.send({ type: 'FLOW.CREATE' })
}
</script>

<style scoped>
.dialog-editor {
  display: flex;
  position: relative;
  overflow: hidden;
  height: 100%;
  width: 100%;
}

/* palette (left) */
.palette {
  width: 240px;
  overflow-y: auto;
  background: #0a0a0a;
  color: #fff;
  border-right: 1px solid #1a1a1a;
}

/* flows list */
.flows-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

/* flow sections */
.flow-section {
  padding: 0 1rem;
}

.root-section {
  flex-shrink: 0;
  padding-top: 1.5rem;
}

.subflows-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding-bottom: 1rem;
}

.flows-grid {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.section-title {
  margin: 0 0 0.75rem 0.25rem;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
}

.section-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #333 20%, #333 80%, transparent);
  margin: 1rem 1rem;
  flex-shrink: 0;
}

/* flow items */
.flow-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-bottom: 8px;
  padding: 12px 14px;
  background: #161616;
  border: 1px solid #262626;
  border-radius: 8px;
  color: #e0e0e0;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.flow-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at top left, rgba(0, 188, 212, 0.05), transparent 50%);
  opacity: 0;
  transition: opacity 0.3s;
}

.flow-item:hover {
  background: #1a1a1a;
  border-color: #333;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.flow-item:hover::before {
  opacity: 1;
}

/* root flow special styling */
.flow-item.root-flow {
  background: linear-gradient(135deg, #1a1a1a 0%, #161616 100%);
  border: 1px solid #2a2a2a;
}

.flow-item.root-flow:hover {
  background: linear-gradient(135deg, #1f1f1f 0%, #1a1a1a 100%);
  border-color: #00bcd4;
  box-shadow: 0 0 0 1px rgba(0, 188, 212, 0.1), 0 6px 16px rgba(0, 0, 0, 0.6);
}

.flow-item.active {
  background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  border-color: #00bcd4;
  color: #fff;
  box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2), 0 4px 12px rgba(0, 188, 212, 0.3);
}

.flow-item.active .flow-icon {
  color: #fff;
}

.flow-item.active .flow-description {
  color: rgba(255, 255, 255, 0.8);
}

/* flow header */
.flow-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-icon {
  color: #00bcd4;
  flex-shrink: 0;
}

.flow-name {
  font-weight: 500;
  font-size: 14px;
  line-height: 1.2;
}

.flow-description {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
  margin-left: 24px;
}

/* empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 3rem 1rem;
  text-align: center;
  height: 100%;
}

.empty-icon {
  color: #333;
}

.empty-state p {
  color: #666;
  font-size: 14px;
  margin: 0;
}

/* steps palette */
.steps-palette {
  padding: 1.5rem 1rem;
}

.steps-palette button {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 14px;
  background: #161616;
  border: 1px solid #262626;
  border-radius: 8px;
  color: #e0e0e0;
  cursor: grab;
  text-align: left;
  font-size: 14px;
  transition: all 0.2s;
  position: relative;
}

.steps-palette button:hover {
  background: #1a1a1a;
  border-color: #333;
  transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.steps-palette button:active {
  cursor: grabbing;
  transform: scale(0.98);
}

/* graph canvas */
.graph {
  flex: 1;
  background: #0a0a0a;
}

/* layout button */
.layout-button {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 4;
  padding: 8px 14px;
  background: #161616;
  border: 1px solid #262626;
  border-radius: 8px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.layout-button:hover {
  background: #1a1a1a;
  border-color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* minimap */
:deep(.vue-flow__minimap) {
  opacity: 0.15;
  transition: opacity 0.2s;
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
}

:deep(.vue-flow__minimap:hover) {
  opacity: 1;
}

/* backdrop overlay */
.backdrop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  z-index: 5;
}

/* slide-in form */
.slide-in-form {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  width: 40%;
  height: 100%;
  /* background: rgba(0, 0, 0, 0.9); */
  border-left: 1px solid #333;
  transform: translateX(100%);
  transition: transform 0.3s ease-in-out;
  z-index: 6;
  overflow-y: auto;
  overflow-x: hidden;
}

.slide-in-form.is-open {
  transform: translateX(0);
}

/* Scrollbar styling */
.palette::-webkit-scrollbar,
.flows-grid::-webkit-scrollbar {
  width: 6px;
}

.palette::-webkit-scrollbar-track,
.flows-grid::-webkit-scrollbar-track {
  background: transparent;
}

.palette::-webkit-scrollbar-thumb,
.flows-grid::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}

.palette::-webkit-scrollbar-thumb:hover,
.flows-grid::-webkit-scrollbar-thumb:hover {
  background: #444;
}

/* Create new flow button */
.create-flow-section {
  flex-shrink: 0;
  padding: 1rem;
  border-top: 1px solid #1a1a1a;
  background: linear-gradient(to top, #0a0a0a 0%, rgba(10, 10, 10, 0.95) 50%, rgba(10, 10, 10, 0) 100%);
}

.create-flow-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px 20px;
  background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%);
  border: 1px solid #00bcd4;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 8px;
}

.create-flow-button:hover {
  background: linear-gradient(135deg, #00d4e6 0%, #00acc1 100%);
  border-color: #00d4e6;
  box-shadow: 0 4px 12px rgba(0, 188, 212, 0.3);
  transform: translateY(-1px);
}

.create-flow-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
}

.create-icon {
  flex-shrink: 0;
}
</style>
