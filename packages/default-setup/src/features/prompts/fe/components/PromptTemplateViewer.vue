<template>
  <SimpleMonacoEditor
    :model-value="value"
    language="javascript"
    :read-only="true"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

defineProps<{
  value: string;
}>();
</script> 