<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <div class="absolute w-64 p-4 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg top-4 right-4 dark:bg-gray-800 dark:border-gray-700">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-neutral-100 dark:text-gray-100">Node Details</h4>
        <button
          @click="$emit('close')"
          class="p-1 rounded hover:bg-neutral-800 dark:hover:bg-gray-700 transition-colors"
          title="Close panel"
        >
          <X class="w-3 h-3 text-gray-500" />
        </button>
      </div>
      
      <div class="space-y-3">
        <InfoField label="ID" :value="node.id" monospace />
        <InfoField label="Type" :value="node.type || 'Unknown'" />
        <InfoField label="Label" :value="node.label || node.id" />
        <InfoField 
          v-if="node.connections !== undefined" 
          label="Connections" 
          :value="`${node.connections} edges`" 
        />
        
        <!-- Additional properties -->
        <div v-if="additionalProperties.length > 0" class="pt-2 border-t border-neutral-700 dark:border-gray-700">
          <h5 class="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Properties</h5>
          <div class="space-y-2">
            <InfoField 
              v-for="prop in additionalProperties" 
              :key="prop.key"
              :label="prop.label" 
              :value="prop.value" 
              small
            />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import InfoField from './InfoField.vue';

interface Props {
  node: {
    id: string;
    type?: string;
    label?: string;
    connections?: number;
    [key: string]: any;
  };
}

const props = defineProps<Props>();

defineEmits<{
  close: [];
}>();

const additionalProperties = computed(() => {
  const excluded = ['id', 'type', 'label', 'connections'];
  return Object.entries(props.node)
    .filter(([key]) => !excluded.includes(key))
    .map(([key, value]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
    }));
});
</script> 