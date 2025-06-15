<template>
  <div class="flex w-full h-full overflow-hidden">
    <!-- Schema Panel -->
    <div class="flex-shrink-0 w-64 overflow-y-auto border-r border-gray-200 dark:border-gray-700">
      <SchemaPanel />
    </div>
    
    <!-- Main Content Area -->
    <div class="flex flex-1 min-w-0">
      <!-- Query Editor -->
      <div class="w-1/2 h-full overflow-y-auto border-r border-gray-200 dark:border-gray-700">
        <QueryEditor />
      </div>
      
      <!-- Graph Explorer -->
      <div class="w-1/2 h-full overflow-hidden">
        <GraphExplorer />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SchemaPanel from './SchemaPanel.vue'
import QueryEditor from './QueryEditor.vue'
import GraphExplorer from './GraphExplorer.vue'
</script> 