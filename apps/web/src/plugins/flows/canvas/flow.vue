<template>
  <div class="dialog-editor">
    <!-- ▸ Node palette (left) -->
    <aside class="palette">
      <h3>Node&nbsp;Palette</h3>
      <button
        v-for="t in nodeTypes"
        :key="t.type"
        draggable="true"
        @dragstart="onDragStart($event, t.type)"
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
        <input v-model="selected.data.label" class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600" />
      </label>

      <!-- show prompt only on LLM nodes -->
      <label
        v-if="selected.data.nodeType === 'llm'"
        class="block mb-2 text-sm font-medium text-neutral-200"
      >
        Prompt
        <textarea v-model="selected.data.prompt" rows="5" class="w-full px-3 py-2 text-sm rounded bg-neutral-900/40 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary-600" />
      </label>
    </section>
  </div>

  <!-- ▸ Console (bottom) -->
  <!-- <footer class="console">
    <div v-for="log in logs" :key="log.id">{{ log.text }}</div>
  </footer> -->
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  VueFlow,
  MarkerType,
  addEdge,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseEvent,
} from "@vue-flow/core";
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

import { applicationState } from '@/app'
import { id, type FlowsState } from '@/plugins/flows/state.ts';
import Flow from './flow.vue';
import { useSelector } from "@xstate/vue";

const actor: FlowsState = applicationState.system.get(id);
const entity = useSelector(actor, (state) => state.context.entity);
const relation = useSelector(actor, (state) => state.context.relation);
const role = useSelector(actor, (state) => state.context.role);

const dialogRows = computed(() => {
  return {
    entity: entity.value,
    relation: relation.value,
    role: role.value,
  };
});

type Element = Node | Edge;

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
const colorForType = (t: string) =>
  ({ 'event-listener': "#00bcd4", transform: "#9c27b0", llm: "#607d8b", response: "#4caf50" }[
    t as keyof any
  ] ?? "#888");

function rowsToElements(rows: typeof dialogRows['value']): Element[] {
  if (!rows || !rows.entity || !rows.relation) {
    return [];
  }
  const nodes: Node[] = rows.entity
    .filter((e) => e.entityType === "Step")
    .map((n) => ({
      id: n.id,
      position: { x: n.x, y: n.y },
      data: { ...n },
      style: {
        border: `2px solid ${colorForType(n.stepType)}`,
        color: "#fff",
        padding: "6px 14px",
        "border-radius": "8px",
        "background-color": "transparent",
      },
      label: n.label,
    }));

  const edges: Edge[] = rows.relation.map((r) => {
    const dashed = r.kind !== "transitions_to";
    return {
      id: `${r.srcId}-${r.tgtId}`,
      source: r.srcId,
      target: r.tgtId,
      animated: false,
      style: dashed
        ? { "stroke-dasharray": "4 4", stroke: "#b084f5" }
        : undefined,
      type: dashed ? "straight" : "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: dashed ? "#b084f5" : "#999",
      },
    };
  });

  return [...nodes, ...edges];
}

/* ------------------------------------------------------------------ */
/* component state                                                    */
/* ------------------------------------------------------------------ */
const elements = ref<Element[]>(rowsToElements(dialogRows.value));
const selected = ref<Node | null>(null);
const logs = ref<{ id: number; text: string }[]>([]);

/* palette drag-and-drop ------------------------------------------- */
const nodeTypes = [
  { type: "input", label: "Input" },
  { type: "llm", label: "LLM" },
  { type: "transform", label: "Transform" },
  { type: "decision", label: "Decision" },
  { type: "output", label: "Output" },
];

function onDragStart(e: DragEvent, nodeType: string) {
  e.dataTransfer?.setData("application/vueflow", nodeType);
  e.dataTransfer!.effectAllowed = "move";
}

/* canvas events --------------------------------------------------- */
function onNodeClick(e: NodeMouseEvent) {
  selected.value = e.node;
}

function onConnect(params: Connection) {
  elements.value = addEdge(params, elements.value);
  logs.value.unshift({
    id: Date.now(),
    text: `${params.source} → ${params.target} connected`,
  });
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

/* graph canvas (centre) */
.graph {
  flex: 1;
  background: #111;
}

/* inspector (right) */
.inspector {
  width: 260px;
  background: #ffffff;
  padding: 1rem;
  overflow: auto;
  border-left: 1px solid #eee;
}
.inspector h3 {
  margin-top: 0;
}
.field {
  display: block;
  font-size: 12px;
  margin: 0.75rem 0;
}
.field input,
.field textarea {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
}

/* console (bottom) */
.console {
  height: 110px;
  background: #000;
  color: #0f0;
  padding: 0.5rem 1rem;
  overflow-y: auto;
  font-family: monospace;
  font-size: 11px;
  border-top: 1px solid #333;
}
</style>