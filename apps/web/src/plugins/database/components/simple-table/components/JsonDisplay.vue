<template>
  <div class="p-4">
    <pre class="p-4 overflow-auto text-sm rounded-md bg-neutral-100 dark:bg-neutral-800">{{ formattedJson }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  data: any;
}

const props = defineProps<Props>();

const formattedJson = computed(() => {
  return JSON.stringify(props.data, null, 2);
});
</script> 