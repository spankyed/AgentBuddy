<template>
  <div class="max-w-4xl mx-auto">
    <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
      <h3 class="text-lg font-semibold text-white mb-4">Review & Confirmation</h3>
      <div class="space-y-4">
        <div class="p-4 bg-neutral-900 rounded-lg">
          <p class="text-neutral-300">{{ artifact.content.message || 'Please review the following changes:' }}</p>
        </div>
        
        <div v-if="artifact.content.items" class="space-y-2">
          <div 
            v-for="(item, index) in artifact.content.items" 
            :key="index"
            class="flex items-start space-x-2 p-3 bg-neutral-900 rounded"
          >
            <CheckSquare :size="16" class="text-green-500 mt-0.5" />
            <span class="text-sm text-neutral-300">{{ item }}</span>
          </div>
        </div>
        
        <div class="flex space-x-3 pt-4">
          <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
            Approve
          </button>
          <button class="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-600 transition-colors">
            Request Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckSquare } from 'lucide-vue-next';
import type { ArtifactItem } from '../../../types';

defineProps<{
  artifact: ArtifactItem;
}>();
</script>