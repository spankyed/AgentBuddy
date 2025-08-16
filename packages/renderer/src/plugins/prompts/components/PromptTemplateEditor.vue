<template>
  <SimpleMonacoEditor
    :model-value="value"
    language="javascript"
    @update:model-value="$emit('update', $event)"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

defineProps<{
  value: string;
}>();

defineEmits<{
  update: [value: string];
}>();
</script> 