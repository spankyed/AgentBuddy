<template>
  <div class="flex h-full w-full">
    <!-- Schema Panel -->
    <div class="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
      <SchemaPanel />
    </div>
    
    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col">
      <!-- Query Editor -->
      <div class="h-2/5 border-b border-gray-200 dark:border-gray-700">
        <QueryEditor />
      </div>
      
      <!-- Graph Explorer -->
      <div class="flex-1">
        <GraphExplorer />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SchemaPanel from './SchemaPanel.vue';
import QueryEditor from './QueryEditor.vue';
import GraphExplorer from './GraphExplorer.vue';
</script> 