<template>
  <!-- Renders the component resolved from `view` + `route` -->
  <component :is="resolved" v-if="resolved" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import type { RouteComponents } from '@/plugins/types.ts';

interface Props {
  views?: Component | RouteComponents;
  target?: string;
}

const props = defineProps<Props>();

function isVueComponent(x: unknown): x is RouteComponents {
  return x.render && x.setup; // Check if it's a Vue component - need to find a better way
}

const resolved = computed<Component | undefined>(() => {
  if (!props.views) return undefined;

  if (!isVueComponent(props.views)) {
    // Prefer an explicit match, otherwise first component in the record
    return (
      props.views[props.target || ''] ??
      Object.values(props.views)[0] ?? // safe fallback
      undefined
    );
  }

  // Single vue component
  return props.views;
});
</script>