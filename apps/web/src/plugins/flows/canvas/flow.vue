<template>
  <div class="dialog-editor">
    <!-- ▸ Node palette (left) -->
    <aside class="palette">
      <!-- Toggle buttons -->
      <div class="palette-toggle">
        <button 
          :class="{ active: paletteView === 'flows' }"
          @click="paletteView = 'flows'"
        >
          Flows
        </button>
        <button 
          :class="{ active: paletteView === 'steps' }"
          @click="paletteView = 'steps'"
        >
          Steps
        </button>
      </div>

      <!-- Flows list view -->
      <div v-if="paletteView === 'flows'" class="flows-list">
        <h3>Flows</h3>
        <div v-if="flows.length === 0" class="empty-state">
          No flows created yet
        </div>
        <button
          v-for="flow in flows"
          :key="flow.id"
          class="flow-item"
          :class="{ active: flow.id === selectedFlowId }"
          @click="onFlowClick(flow)"
        >
          <span class="flow-name">{{ flow.label || `Flow ${flow.id}` }}</span>
          <span v-if="flow.description" class="flow-description">{{ flow.description }}</span>
        </button>
      </div>

      <!-- Steps palette view -->
      <div v-else class="steps-palette">
        <h3>Node&nbsp;Palette</h3>
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
      <template v-for="(_, type) in nodeTypes" :key="type" #[`node-${type}`]="nodeProps">
        <component :is="nodeTypes[type]" v-bind="nodeProps" />
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

const { addNodes, fitView } = useVueFlow()
const { layout } = useLayout()

function getFormComponent(nodeType: string) {
  const formMap: Record<string, any> = {
    'listen': ListenForm,
    'fire': FireForm,
    'create': CreateForm,
  }
  return formMap[nodeType] || BaseForm
}

function colorForType(type: string) {
  return ({ input: '#00bcd4', transform: '#9c27b0', llm: '#607d8b', output: '#4caf50' }[
    type as keyof any
  ] ?? '#888')
}

/* ------------------------------------------------------------ */
/*  reactive state from the actor                               */
/* ------------------------------------------------------------ */
const actor: FlowsState = applicationState.system.get(id)

const nodes   = useSelector(actor, (s) => s.context.graph.nodes)
const edges   = useSelector(actor, (s) => s.context.graph.edges)
const logs    = useSelector(actor, (s) => s.context.logs)
const flows   = useSelector(actor, (s) => s.context.flows)
const selectedFlowId = useSelector(actor, (s) => s.context.selectedFlowId)
const selected = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.selectedNodeId)
) as Ref<NodeEntity | undefined>

// Palette view state
const paletteView = ref<'flows' | 'steps'>('steps')

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
  width: 210px;
  overflow-y: scroll;
  background: #1f1f1f;
  color: #fff;
  border-right: 1px solid #333;
}
.palette h3 {
  margin: 0 0 0.75rem;
  font-size: 16px;
  font-weight: 600;
}

/* palette toggle */
.palette-toggle {
  display: flex;
  gap: 4px;
  margin: 1rem 1rem 0;
  padding: 4px;
  background: #2b2b2b;
  border-radius: 8px;
}

.palette-toggle button {
  flex: 1;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.palette-toggle button:hover {
  color: #ddd;
}

.palette-toggle button.active {
  background: #444;
  color: #fff;
}

/* flows list */
.flows-list {
  padding: 1rem;
}

.flows-list .empty-state {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.flow-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  margin: 6px 0;
  padding: 10px 14px;
  background: #2b2b2b;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.flow-item:hover {
  background: #333;
  border-color: #555;
}

.flow-item.active {
  background: #444;
  border-color: #00bcd4;
  border-width: 2px;
}

.flow-name {
  font-weight: 500;
  font-size: 14px;
}

.flow-description {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}

/* steps palette */
.steps-palette {
  padding: 1rem;
}

.steps-palette h3 {
  margin: 0 0 0.75rem;
  font-size: 16px;
  font-weight: 600;
}

.steps-palette button {
  display: block;
  width: 100%;
  margin: 6px 0;
  padding: 8px 12px;
  background: #2b2b2b;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  cursor: grab;
  text-align: left;
}

.steps-palette button:hover {
  background: #333;
}

/* graph canvas */
.graph {
  flex: 1;
  background: #111;
}

/* layout button */
.layout-button {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 4;
  padding: 8px 12px;
  background: #2b2b2b;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  cursor: pointer;
}

.layout-button:hover {
  background: #333;
}

/* minimap */
:deep(.vue-flow__minimap) {
  opacity: 0.1;
  transition: opacity 0.2s;
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
</style>
