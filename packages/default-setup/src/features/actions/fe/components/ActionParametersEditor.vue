<template>
  <div class="space-y-2">
    <!-- Existing Parameters -->
    <div v-if="parameterEntries.length > 0" class="space-y-2">
      <ParameterRow
        v-for="(entry, index) in parameterEntries"
        :key="`param-${index}-${entry.stableId}`"
        :param-key="entry.key"
        :type="entry.param.type"
        :required="entry.param.required === true"
        :description="entry.param.description"
        :expanded="expandedParams.has(entry.key)"
        @update:key="updateParameterKey(entry.key, $event)"
        @update:type="updateParameter(entry.key, { ...entry.param, type: $event as any })"
        @update:required="updateParameter(entry.key, { ...entry.param, required: $event })"
        @update:description="updateParameter(entry.key, { ...entry.param, description: $event })"
        @update:expanded="toggleExpanded(entry.key)"
        @remove="removeParameter(entry.key)"
      />
    </div>

    <!-- Add Parameter Button -->
    <button
      data-onboarding-id="action-parameters-section"
      @click="addParameter"
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
    >
      <Plus class="w-4 h-4" />
      Add Parameter
    </button>

  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { ActionParameter } from '@app/api';
import ParameterRow from '@/core/components/design/ParameterRow.vue';

const props = defineProps<{
  parameters: Record<string, ActionParameter>;
}>();

const emit = defineEmits<{
  update: [parameters: Record<string, ActionParameter>];
}>();

// Create stable IDs for each parameter to prevent focus loss
const parameterIdMap = ref<Map<string, string>>(new Map());

// Track which parameters are expanded
const expandedParams = ref<Set<string>>(new Set());

function toggleExpanded(key: string) {
  if (expandedParams.value.has(key)) {
    expandedParams.value.delete(key);
  } else {
    expandedParams.value.add(key);
  }
}

const parameterEntries = computed(() => {
  return Object.entries(props.parameters).map(([key, param]) => {
    // Get or create a stable ID for this parameter
    if (!parameterIdMap.value.has(key)) {
      parameterIdMap.value.set(key, `${key}-${Date.now()}-${Math.random()}`);
    }
    return {
      key,
      param,
      stableId: parameterIdMap.value.get(key)!
    };
  });
});

function updateParameter(key: string, param: ActionParameter) {
  const updated = { ...props.parameters, [key]: param };
  emit('update', updated);
}

function updateParameterKey(oldKey: string, newKey: string) {
  if (!newKey.trim() || oldKey === newKey) return;
  
  // Create new parameters object with updated key
  const updated = { ...props.parameters };
  const param = updated[oldKey];
  
  // Remove old key and add with new key
  delete updated[oldKey];
  updated[newKey] = param;
  
  // Transfer the stable ID to the new key
  const stableId = parameterIdMap.value.get(oldKey);
  if (stableId) {
    parameterIdMap.value.delete(oldKey);
    parameterIdMap.value.set(newKey, stableId);
  }
  
  emit('update', updated);
}

function removeParameter(key: string) {
  const updated = { ...props.parameters };
  delete updated[key];
  
  // Clean up the stable ID
  parameterIdMap.value.delete(key);
  
  emit('update', updated);
}

function addParameter() {
  const existingKeys = Object.keys(props.parameters);
  let newKey = 'param1';
  let counter = 1;

  while (existingKeys.includes(newKey)) {
    counter++;
    newKey = `param${counter}`;
  }

  const updated = {
    ...props.parameters,
    [newKey]: {
      type: 'any' as const,
      required: false,
      description: ''
    }
  };

  emit('update', updated);
}
</script>