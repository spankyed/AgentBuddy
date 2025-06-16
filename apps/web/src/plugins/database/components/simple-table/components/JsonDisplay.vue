<template>
  <div class="p-4">
    <pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-auto text-sm">{{ formattedJson }}</pre>
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