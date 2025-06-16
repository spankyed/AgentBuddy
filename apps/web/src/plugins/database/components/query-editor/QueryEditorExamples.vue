<template>
  <div class="p-4 overflow-y-auto">
    <div class="space-y-3">
      <ExampleCard
        v-for="(example, index) in examples"
        :key="index"
        :example="example"
        @select="$emit('select', example.query)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ExampleCard from './ExampleCard.vue';
import { queryExamples } from './query-examples';

const examples = queryExamples;

defineEmits<{
  select: [query: string];
}>();
</script> 