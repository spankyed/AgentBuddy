<template>
  <div class="space-y-4">
    <!-- Existing Parameters -->
    <div v-if="parameterEntries.length > 0" class="space-y-3">
      <div
        v-for="(entry, index) in parameterEntries"
        :key="`param-${index}-${entry.stableId}`"
        class="p-4 transition-all duration-200 border rounded-md bg-neutral-800/50 border-neutral-700 hover:border-neutral-600"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block mb-1 text-xs font-medium text-neutral-400">Key</label>
                <input
                  :value="entry.key"
                  @input="updateParameterKey(entry.key, ($event.target as HTMLInputElement).value)"
                  type="text"
                  class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                  placeholder="Parameter key"
                />
              </div>
              <div>
                <label class="block mb-1 text-xs font-medium text-neutral-400">Type</label>
                <select
                  :value="entry.param.type"
                  @change="updateParameter(entry.key, { ...entry.param, type: ($event.target as HTMLSelectElement).value as any })"
                  class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="object">Object</option>
                  <option value="array">Array</option>
                  <option value="any">Any</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block mb-1 text-xs font-medium text-neutral-400">Description</label>
              <input
                :value="entry.param.description || ''"
                @input="updateParameter(entry.key, { ...entry.param, description: ($event.target as HTMLInputElement).value })"
                type="text"
                class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                placeholder="Parameter description"
              />
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center gap-2 text-sm text-neutral-400">
                <input
                  type="checkbox"
                  :checked="entry.param.required !== false"
                  @change="updateParameter(entry.key, { ...entry.param, required: ($event.target as HTMLInputElement).checked })"
                  class="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                Required
              </label>
              <div v-if="entry.param.type !== 'boolean' && !entry.param.required" class="flex-1">
                <input
                  :value="entry.param.default || ''"
                  @input="updateParameter(entry.key, { ...entry.param, default: ($event.target as HTMLInputElement).value })"
                  type="text"
                  class="w-full px-3 py-2 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
                  placeholder="Default value"
                />
              </div>
            </div>
          </div>
          <button
            @click="removeParameter(entry.key)"
            class="p-2 transition-colors rounded-md hover:bg-neutral-700"
            title="Remove parameter"
          >
            <X class="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>
    </div>

    <!-- Add Parameter Button -->
    <button
      @click="addParameter"
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-2 border-dashed rounded-md border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
    >
      <Plus class="w-4 h-4" />
      Add Parameter
    </button>

    <!-- Empty State -->
    <div v-if="parameterEntries.length === 0" class="p-8 text-center border-2 border-dashed rounded-lg border-neutral-700">
      <Code class="w-12 h-12 mx-auto mb-3 text-neutral-600" />
      <p class="text-sm text-neutral-400">No parameters defined</p>
      <p class="mt-1 text-xs text-neutral-500">Add parameters that your action function will receive</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, X, Code } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import type { ActionParameter } from '@abuddy/api';

const props = defineProps<{
  parameters: Record<string, ActionParameter>;
}>();

const emit = defineEmits<{
  update: [parameters: Record<string, ActionParameter>];
}>();

// Create stable IDs for each parameter to prevent focus loss
const parameterIdMap = ref<Map<string, string>>(new Map());

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
      type: 'string' as const,
      required: true,
      description: ''
    }
  };
  
  emit('update', updated);
}
</script>