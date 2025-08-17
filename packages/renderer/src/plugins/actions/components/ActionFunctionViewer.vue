<template>
  <SimpleMonacoEditor
    :model-value="code"
    language="javascript"
    :read-only="true"
    class="h-full"
  />
</template>

<script setup lang="ts">
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

defineProps<{
  code: string;
}>();
</script>