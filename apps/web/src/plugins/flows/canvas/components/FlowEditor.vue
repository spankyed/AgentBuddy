<template>
  <div class="relative flex-1">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      class="w-full h-full bg-neutral-900"
      :fit-view-on-init="true"
      :connection-line-type="ConnectionLineType.SmoothStep"
      :default-edge-options="{
        type: 'generic',
        style: { strokeWidth: 2 },
        markerEnd: MarkerType.Arrow
      }"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :connect-on-click="true"
      @node-click="$emit('node-click', $event)"
      @connect="$emit('connect', $event)"
      @drop="$emit('drop', $event)"
      @dragover.prevent
      @nodes-initialized="$emit('nodes-initialized')"
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

      <!-- Back button and Actions menu (top left) -->
      <div class="absolute z-10 flex gap-2 top-4 left-4">
        <!-- Back button -->
        <Button
          variant="secondary"
          class="!p-2 !h-auto bg-neutral-800 hover:bg-neutral-700 text-neutral-50"
          @click="$emit('go-back')"
          title="Back to flows list"
        >
          <ChevronLeft :size="18" />
        </Button>
        
        <!-- Actions menu -->
        <FlowActionsMenu 
          :selected-flow-id="selectedFlowId"
          @layout="(direction) => $emit('layout', direction)"
          @edit-label="$emit('edit-label')"
        />
      </div>
    </VueFlow>
    
    <!-- Backdrop overlay when in list state -->
    <div 
      v-if="showOverlay" 
      class="absolute top-0 left-0 z-10 w-full h-full cursor-pointer bg-black/30"
      @click="$emit('overlay-click')"
    />
  </div>
</template>

<script setup lang="ts">
import {
  VueFlow,
  ConnectionLineType,
  MarkerType,
} from '@vue-flow/core'
import type { Connection, NodeMouseEvent, Node as VueFlowNode, Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { ChevronLeft } from 'lucide-vue-next'

import GenericEdge from '../edges/GenericEdge.vue'
import { nodeTypes } from '../nodes'

import type { Direction } from '@/plugins/flows/canvas/useLayout'
import Button from '@/core/design/button.vue'
import FlowActionsMenu from './FlowActionsMenu.vue'

interface Props {
  nodes: VueFlowNode[]
  edges: Edge[]
  selectedFlowId?: string | null
  showOverlay?: boolean
}

defineProps<Props>()

defineEmits<{
  'node-click': [event: NodeMouseEvent]
  'connect': [params: Connection]
  'drop': [event: DragEvent]
  'go-back': []
  'layout': [direction?: Direction]
  'edit-label': []
  'overlay-click': []
  'nodes-initialized': []
}>()
</script> 