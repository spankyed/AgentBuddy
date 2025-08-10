<template>
  <!-- Renders the component resolved from `view` + `route` -->
  <component :is="resolved" v-if="resolved" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import type { RouteComponents } from '@/core/types';

interface Props {
  views?: Component | RouteComponents;
  target?: string;
}

const props = defineProps<Props>();

function isRouteComponents(x: Component | RouteComponents | undefined): x is RouteComponents {
  // RouteComponents is an object with string keys mapping to components
  // A Vue component won't have string keys like this
  return (
    typeof x === 'object' &&
    x !== null &&
    !('render' in x || 'setup' in x || '__file' in x) &&
    Object.keys(x).length > 0 &&
    typeof Object.keys(x)[0] === 'string'
  );
}

const resolved = computed<Component | undefined>(() => {
  if (!props.views) return undefined;

  if (isRouteComponents(props.views)) {
    // Multiple views - it's a RouteComponents object
    // Prefer an explicit match, otherwise first component in the record

    const target: string = props.target || '';

    return (
      props.views[target as keyof typeof props['views']] ??
      Object.values(props.views)[0] ?? // safe fallback
      undefined
    );
  }

  // Single vue component
  return props.views;
});
</script>