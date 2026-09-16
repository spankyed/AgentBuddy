<template>
  <div>
    <label class="block mb-3 text-xs font-semibold tracking-wider uppercase text-neutral-500">
      Entity Type
    </label>
    <input
      :value="modelValue || ''"
      list="create-step-entity-types"
      placeholder="Note"
      class="w-full px-3 py-2 text-sm border rounded-md bg-neutral-800/50 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value || undefined)"
    />
    <datalist id="create-step-entity-types">
      <option v-for="entityType in entityTypes" :key="entityType" :value="entityType" />
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { EARS } from '@/__generated__/ears'

defineProps<{ modelValue?: string }>()
defineEmits<{ 'update:modelValue': [entityType: string | undefined] }>()

const entityTypes = Object.values(EARS.Entity)
</script>
