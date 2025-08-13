<template>
  <div class="text-xs">
    <!-- Flow Configuration Section -->
    <section v-if="flowRef || flowLabel" class="mb-4">
      <h4 class="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Flow Configuration
      </h4>
      <div class="space-y-2">
        <div v-if="flowRef" class="flex items-baseline gap-2">
          <span class="text-gray-500 flex-shrink-0">Flow ID:</span>
          <span class="text-gray-300 break-words">{{ flowRef }}</span>
        </div>
        <div v-if="flowLabel" class="flex items-baseline gap-2">
          <span class="text-gray-500 flex-shrink-0">Flow Name:</span>
          <span class="text-gray-300 break-words">{{ flowLabel }}</span>
        </div>
      </div>
    </section>

    <!-- Entry Parameter Section -->
    <section v-if="entryParameter" class="mb-4">
      <h4 class="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Entry Parameter
      </h4>
      <div class="flex items-start gap-2">
        <span class="text-gray-500 flex-shrink-0">payload:</span>
        <span v-if="!isComplexValue(entryParameter)" class="text-gray-300 break-words">{{ formatValue(entryParameter) }}</span>
        <div v-else class="text-gray-300">
          <DataRenderer :data="entryParameter" :default-expanded="false" />
        </div>
      </div>
    </section>

    <!-- Resolved Entry Params Section -->
    <section v-if="resolvedParams" class="mb-4">
      <h4 class="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Resolved Entry Params
      </h4>
      <div class="relative bg-black/30 border border-white/5 rounded-md p-3">
        <DataRenderer :data="resolvedParams" :default-expanded="false" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';
import type { TNodeEntity } from '@app/api';
import DataRenderer from '@/plugins/logs/data-renderer.vue';

// Types
type FieldMapping =
  | { target: string; source: unknown }
  | (Record<string, unknown> & { target: string; source: unknown });

interface Props {
  node: TNodeEntity;
  nodeAttributes: Record<string, any>;
}

const props = defineProps<Props>();

// Flow Configuration
const flowRef = computed(() => props.nodeAttributes?.flowRef);
const flowLabel = computed(() => props.nodeAttributes?.flowLabel);

// Entry Parameter Extraction (cleaner chain of computed properties)
const fieldMappings = computed<FieldMapping[] | null>(() => {
  const fm = props.nodeAttributes?.fieldMappings;
  if (!fm) return null;
  return Array.isArray(fm) ? fm : [fm];
});

const entryMapping = computed<FieldMapping | null>(() =>
  fieldMappings.value?.find(m => m?.target === 'params') ?? null
);

const entryParameter = computed<unknown | null>(() => 
  entryMapping.value?.source ?? null
);

// Runtime-resolved params
const resolvedParams = computed<unknown | null>(() => 
  props.nodeAttributes?.params ?? null
);

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