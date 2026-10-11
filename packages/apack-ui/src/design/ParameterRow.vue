<template>
  <div class="transition-all duration-200 border rounded-md bg-neutral-800/50 border-neutral-700">
    <!-- Main Row -->
    <div class="flex items-center gap-2 p-2">
      <button
        @click="$emit('update:expanded', !expanded)"
        class="p-1 transition-colors rounded hover:bg-neutral-700"
        :title="expanded ? 'Collapse' : 'Expand options'"
      >
        <ChevronDown
          class="w-4 h-4 transition-transform duration-200 text-neutral-400"
          :class="{ '-rotate-90': !expanded }"
        />
      </button>
      <input
        :value="paramKey"
        @input="$emit('update:key', ($event.target as HTMLInputElement).value)"
        type="text"
        class="flex-1 px-3 py-1.5 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Parameter key"
      />
      <select
        :value="type"
        @change="$emit('update:type', ($event.target as HTMLSelectElement).value)"
        class="px-2 py-1 text-xs rounded bg-neutral-700 text-neutral-300 border-none cursor-pointer hover:bg-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="any">any</option>
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="object">object</option>
        <option value="array">array</option>
      </select>
      <label class="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="required"
          @change="$emit('update:required', ($event.target as HTMLInputElement).checked)"
          class="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
        />
        Required
      </label>
      <button
        @click="$emit('remove')"
        class="p-1 transition-colors rounded-md hover:bg-neutral-700 hover:text-red-400"
        title="Remove parameter"
      >
        <X class="w-4 h-4 text-neutral-400" />
      </button>
    </div>

    <!-- Expanded Section (Description only) -->
    <div
      v-if="expanded"
      class="px-4 pb-3 pt-1 border-t border-neutral-700/50 bg-neutral-900/30"
    >
      <label class="block mb-1 text-xs font-medium text-neutral-500">Description</label>
      <input
        :value="description || ''"
        @input="$emit('update:description', ($event.target as HTMLInputElement).value)"
        type="text"
        class="w-full px-3 py-1.5 text-sm transition-colors border rounded-md bg-neutral-800 border-neutral-700 text-neutral-100 focus:outline-none focus:border-blue-500"
        placeholder="Parameter description"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, X } from 'lucide-vue-next';

defineProps<{
  paramKey: string;
  type: string;
  required: boolean;
  description?: string;
  expanded: boolean;
}>();

defineEmits<{
  'update:key': [value: string];
  'update:type': [value: string];
  'update:required': [value: boolean];
  'update:description': [value: string];
  'update:expanded': [value: boolean];
  'remove': [];
}>();
</script>
