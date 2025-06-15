<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-sm font-semibold">Results Explorer</h3>
      <div class="text-xs text-gray-500">
        {{ queryResult.nodes.length }} nodes, {{ queryResult.edges.length }} edges
      </div>
    </div>
    
    <div class="relative flex-1 overflow-auto">
      <div v-if="queryResult.nodes.length === 0" class="absolute inset-0 flex items-center justify-center text-gray-500">
        <div class="text-center">
          <Database class="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p class="text-sm">Run a query to see results</p>
        </div>
      </div>
      
      <!-- Simple table view as fallback -->
      <div v-else class="p-4 space-y-6">
        <!-- Nodes -->
        <div v-if="queryResult.nodes.length > 0">
          <h4 class="mb-2 text-sm font-semibold">Nodes ({{ queryResult.nodes.length }})</h4>
          <div class="space-y-2">
            <div
              v-for="node in queryResult.nodes"
              :key="node.id"
              class="p-3 border border-gray-200 rounded-lg dark:border-gray-700"
              :style="{ borderLeftColor: entityColors[node.type] || '#6B7280', borderLeftWidth: '4px' }"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium">{{ node.id }}</span>
                  <span class="ml-2 text-xs text-gray-500">{{ node.type }}</span>
                </div>
              </div>
              <div v-if="Object.keys(node.data).length > 0" class="mt-2 space-y-1 text-xs">
                <div v-for="(value, key) in node.data" :key="key" class="flex">
                  <span class="w-24 text-gray-500">{{ key }}:</span>
                  <span class="text-gray-700 dark:text-gray-300">{{ value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Edges -->
        <div v-if="queryResult.edges.length > 0">
          <h4 class="mb-2 text-sm font-semibold">Relationships ({{ queryResult.edges.length }})</h4>
          <div class="space-y-2">
            <div
              v-for="edge in queryResult.edges"
              :key="edge.id"
              class="flex items-center justify-between p-3 border border-gray-200 rounded-lg dark:border-gray-700"
            >
              <div class="flex items-center space-x-2 text-sm">
                <span class="font-medium">{{ edge.source }}</span>
                <span class="text-gray-500">→</span>
                <span class="px-2 py-1 text-xs bg-gray-100 rounded dark:bg-gray-800">{{ edge.type }}</span>
                <span class="text-gray-500">→</span>
                <span class="font-medium">{{ edge.target }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Database } from 'lucide-vue-next';
import { useSelector } from '@xstate/vue';
import { id, type DatabaseState } from '../state';
import { applicationState } from '@/app'

const actor: DatabaseState = applicationState.system.get(id)

const queryResult = useSelector(actor, (state) => state.context.queryResult);

const entityColors: Record<string, string> = {
  Agent: '#3B82F6',    // blue
  Brain: '#8B5CF6',    // purple
  Message: '#10B981',  // green
  Thread: '#F59E0B',   // amber
  Tag: '#EF4444',      // red
  Relation: '#6B7280', // gray
  ContextItem: '#14B8A6', // teal
  CanvasItem: '#F97316',  // orange
  Flow: '#EC4899',        // pink
  Node: '#6366F1',        // indigo
};
</script> 