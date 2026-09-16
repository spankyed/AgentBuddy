<template>
  <div class="max-w-4xl">
    <div class="rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="flex items-center justify-between px-4 pt-3">
        <span class="text-xs text-neutral-500">
          {{ nodes.length }} {{ nodes.length === 1 ? 'node' : 'nodes' }},
          {{ edges.length }} {{ edges.length === 1 ? 'edge' : 'edges' }}
        </span>
        <CopyButton :text="copyText" />
      </div>

      <div v-if="nodes.length === 0" class="px-6 pb-6 text-sm text-neutral-500">
        No graph data in this artifact.
      </div>

      <div v-else class="px-4 pb-4">
        <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="w-full h-auto" role="img" :aria-label="artifact.title">
          <line
            v-for="(edge, index) in resolvedEdges"
            :key="`edge-${index}`"
            :x1="edge.from.x" :y1="edge.from.y"
            :x2="edge.to.x" :y2="edge.to.y"
            class="stroke-neutral-600"
            stroke-width="1.5"
          />
          <g v-for="node in positionedNodes" :key="node.id">
            <circle :cx="node.x" :cy="node.y" r="18" class="fill-neutral-700 stroke-neutral-500" stroke-width="1.5" />
            <text
              :x="node.x" :y="node.y + 34"
              text-anchor="middle"
              class="text-[10px] fill-neutral-300"
            >{{ node.label }}</text>
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ArtifactItem } from '@abuddy/sdk/artifacts';
import CopyButton from '@abuddy/ui/design/CopyButton';

/** A graph artifact's content: nodes with ids, and edges naming a node id at each end */
interface GraphNode { id: string; label?: string }
interface GraphEdge { from: string; to: string }
interface GraphContent { nodes: GraphNode[]; edges?: GraphEdge[] }

/** The viewBox is square, so the layout is resolution-independent */
const SIZE = 400;
const RADIUS = 150;

const props = defineProps<{
  artifact: ArtifactItem;
}>();

const content = computed<GraphContent | null>(() => {
  const raw = props.artifact.content;
  const value = typeof raw === 'string' ? tryParse(raw) : raw;
  if (typeof value !== 'object' || value === null) return null;
  const nodes = (value as GraphContent).nodes;
  return Array.isArray(nodes) ? (value as GraphContent) : null;
});

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const nodes = computed<GraphNode[]>(() =>
  (content.value?.nodes ?? []).filter((node): node is GraphNode =>
    typeof node === 'object' && node !== null && typeof node.id === 'string'),
);

const edges = computed<GraphEdge[]>(() =>
  (content.value?.edges ?? []).filter((edge): edge is GraphEdge =>
    typeof edge === 'object' && edge !== null && typeof edge.from === 'string' && typeof edge.to === 'string'),
);

/**
 * Nodes evenly spaced around a circle. A deterministic layout keeps the artifact
 * stable between renders and needs no layout library.
 */
const positionedNodes = computed(() =>
  nodes.value.map((node, index) => {
    const angle = (index / nodes.value.length) * Math.PI * 2 - Math.PI / 2;
    return {
      id: node.id,
      label: node.label ?? node.id,
      x: SIZE / 2 + Math.cos(angle) * RADIUS,
      y: SIZE / 2 + Math.sin(angle) * RADIUS,
    };
  }),
);

/** Edges whose endpoints both name a known node; others are dropped */
const resolvedEdges = computed(() => {
  const byId = new Map(positionedNodes.value.map((node) => [node.id, node]));
  return edges.value.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ from, to }] : [];
  });
});

const copyText = computed(() =>
  typeof props.artifact.content === 'string'
    ? props.artifact.content
    : JSON.stringify(props.artifact.content, null, 2),
);
</script>
