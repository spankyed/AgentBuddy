<template>
  <div class="dialog-editor">
    <!-- ▸ Node palette (left) -->
    <aside class="palette">
      <h3>Node&nbsp;Palette</h3>
      <button
        v-for="t in paletteItems"
        :key="t.type"
        draggable="true"
        @dragstart="(e) => onDragStart(e, t.type)"
      >
        {{ t.label }}
      </button>
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
      <MiniMap />
    </VueFlow>

    <!-- ▸ Node editor (right) -->
    <component
      v-if="selected"
      :is="getFormComponent(selected.nodeType)"
      :node="selected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type Ref } from 'vue'
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
  useVueFlow,
} from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Edge, Node as VueFlowNode } from '@vue-flow/core'
import type { NodeEntity } from '@abuddy/api'
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

const { addNodes } = useVueFlow()

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
const selected = useSelector(actor, (s) => 
  s.context.graph.nodes.find(node => node.id === s.context.selectedNodeId)
) as Ref<NodeEntity | undefined>

/* Transform nodes and edges for Vue-Flow */
const plainNodes = computed(() =>
  nodes.value.map((n) => ({
    /* 1‑to‑1 mapping – only Vue‑Flow‑required props added */
    id       : n.id!,
    type     : n.nodeType,
    position : { x: n.x ?? 0, y: n.y ?? 0 },
    data     : n,  // The node itself is the data
  })) as VueFlowNode[],
)

const plainEdges = computed(() =>
  Object.values(edges.value).map((e) => ({
    id     : e.id,
    source : e.source,
    target : e.target,
    sourceHandle: `${e.source}-bottom`,  // connect to bottom handle of source node
    targetHandle: `${e.target}-top`,     // connect to top handle of target node
    type   : 'generic',                  // handled by slot above
    data   : { kind: e.kind },
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

function onConnect (params: Connection) {
  actor.send({ type: 'EDGE.CONNECT', src: params.source, tgt: params.target })
}
</script>

<style scoped>
.dialog-editor {
  display: flex;
  height: 100%;
}

/* palette (left) */
.palette {
  width: 210px;
  background: #1f1f1f;
  color: #fff;
  padding: 1rem;
  border-right: 1px solid #333;
}
.palette h3 {
  margin: 0 0 0.75rem;
  font-size: 16px;
  font-weight: 600;
}
.palette button {
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

/* graph canvas */
.graph {
  flex: 1;
  background: #111;
}

/* inspector */
.p-4 {
  width: 260px;
  overflow: auto;
  border-left: 1px solid #333;
}
</style>
