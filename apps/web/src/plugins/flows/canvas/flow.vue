<template>
  <div class="dialog-editor">
    <!-- ▸ Node palette (left) -->
    <aside class="palette">
      <h3>Node&nbsp;Palette</h3>
      <button
        v-for="t in nodeTypes"
        :key="t.type"
        draggable="true"
        @dragstart="(e) => onDragStart(e, t.type)"
      >
        {{ t.label }}
      </button>
    </aside>

    <!-- ▸ VueFlow canvas (center) -->
    <VueFlow
      v-model="elements"
      class="graph"
      :fit-view-on-init="true"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      @node-click="onNodeClick"
      @connect="onConnect"
      @drop="onDrop"
      @dragover.prevent
      :min-zoom="0.2"
      :max-zoom="2"
    >
      <Background variant="dots" />
      <Controls />
      <MiniMap />
    </VueFlow>

    <!-- ▸ Inspector (right) -->
    <section class="p-4 bg-neutral-800" v-if="selected">
      <h3>{{ selected.data.label }}</h3>
      <label class="block mb-2 text-sm font-medium text-neutral-200">
        Name
        <input
          v-model="selected.data.label"
          class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </label>

      <!-- show prompt only on LLM nodes -->
      <label
        v-if="selected.data.stepType === 'llm'"
        class="block mb-2 text-sm font-medium text-neutral-200"
      >
        Prompt
        <textarea
          v-model="selected.data.prompt"
          rows="5"
          class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600"
        />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  VueFlow,
  ConnectionLineType,
  type Connection,
  type NodeMouseEvent,
} from '@vue-flow/core'
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
import { buildElements } from '../graph'

/* ------------------------------------------------------------ */
/*  reactive state from the actor                               */
/* ------------------------------------------------------------ */
const actor: FlowsState = applicationState.system.get(id)


const nodes   = useSelector(actor, (s) => s.context.nodes)
const events  = useSelector(actor, (s) => s.context.events)
const edges   = useSelector(actor, (s) => s.context.edges)
const logs    = useSelector(actor, (s) => s.context.logs)
const selected = useSelector(actor, (s) => s.context.nodes[s.context.selectedNodeId ?? ''])

/* Build Vue‑Flow elements on‑the‑fly so machine stays skinny */
const elements = computed(() => buildElements(nodes.value, events.value, edges.value))

/* ------------------------------------------------------------ */
/*  palette + drag helpers                                      */
/* ------------------------------------------------------------ */
const nodeTypes = [
  { type: 'input', label: 'Input' },
  { type: 'llm', label: 'LLM' },
  { type: 'transform', label: 'Transform' },
  { type: 'decision', label: 'Decision' },
  { type: 'output', label: 'Output' },
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
    stepType: nodeType,
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
