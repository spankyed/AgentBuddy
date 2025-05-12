<template>
  <!-- Renders the component resolved from `view` + `route` -->
  <component :is="resolved" v-if="resolved" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import type { RouteComponents } from '@/shared/types';

interface Props {
  views?: Component | RouteComponents;
  target?: string;
}

const props = defineProps<Props>();

function isVueComponent(x: Component | RouteComponents | undefined): x is RouteComponents {
  return (
    typeof x === 'object' &&
    (x as RouteComponents).render !== undefined &&
    (x as RouteComponents).setup !== undefined
  );
}

const resolved = computed<Component | undefined>(() => {
  if (!props.views) return undefined;

  if (!isVueComponent(props.views)) {
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