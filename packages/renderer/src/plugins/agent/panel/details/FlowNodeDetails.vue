<template>
  <div class="text-xs">
    <!-- Input Parameters Section -->
    <section v-if="hasInputParams" class="mb-4">
      <h4 class="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Input Parameters
      </h4>
      <div class="space-y-2">
        <div v-for="(value, key) in inputParams" :key="key" class="flex items-baseline gap-2">
          <span class="text-gray-500 flex-shrink-0">{{ key }}:</span>
          <span v-if="!isComplexValue(value)" class="text-gray-300 break-words">{{ formatValue(value) }}</span>
          <div v-else class="text-gray-300">
            <DataRenderer :data="value" :default-expanded="false" />
          </div>
        </div>
      </div>
    </section>

    <!-- Output Result Section -->
    <section v-if="hasOutput" class="mb-4">
      <h4 class="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Output Result
      </h4>
      <div class="relative bg-black/30 border border-white/5 rounded-md p-3">
        <DataRenderer :data="outputResult" :default-expanded="true" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TNodeEntity } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

// Show all input parameters except result
const inputParams = computed(() => {
  const params: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(props.nodeAttributes)) {
    // Exclude result as it's shown in output section
    if (key !== 'result') {
      params[key] = value;
    }
  }
  
  return params;
});

const outputResult = computed(() => props.nodeAttributes.result);

const hasInputParams = computed(() => Object.keys(inputParams.value).length > 0);
const hasOutput = computed(() => outputResult.value !== undefined);

// Helpers
function isComplexValue(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      // Handle circular refs or non-serializable objects
      return String(value);
    }
  }
  return String(value);
}
</script>