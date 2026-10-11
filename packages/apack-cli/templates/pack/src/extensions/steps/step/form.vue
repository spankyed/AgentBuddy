<script setup lang="ts">
import BaseForm from '@apack/ui/components/BaseForm';
import type { __PASCAL__Node } from './types.ts';

defineProps<{
  node: __PASCAL__Node;
  resources?: Record<string, unknown[] | undefined>;
}>();

defineEmits<{
  'update-node': [updates: Record<string, unknown>];
  close: [];
}>();
</script>

<template>
  <BaseForm :node="node" @update-node="$emit('update-node', $event)" @close="$emit('close')">
    <p class="text-xs text-neutral-400">__PASCAL__ step configuration</p>
  </BaseForm>
</template>
