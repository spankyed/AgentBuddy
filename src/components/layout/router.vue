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
  route?: string;
}

const props = defineProps<Props>();

function isRouteMap(x: unknown): x is RouteComponents {
  return typeof x === 'object' && x !== null;
}

const resolved = computed<Component | undefined>(() => {
  if (!props.views) return undefined;

  if (isRouteMap(props.views)) {
    // Prefer an explicit match, otherwise first component in the record
    return (
      props.views[props.route || ''] ??
      Object.values(props.views)[0] ?? // safe fallback
      undefined
    );
  }

  // Single‑view plugin
  return props.views;
});
</script>