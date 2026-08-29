<template>
  <div class="p-4">
    <div class="rounded-md overflow-hidden border border-neutral-800" style="height: 400px; max-height: 600px;">
      <SimpleMonacoEditor
        :model-value="formattedJson"
        language="json"
        :read-only="true"
        class="h-full"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SimpleMonacoEditor from '@/core/components/SimpleMonacoEditor.vue';

interface Props {
  data: any;
}

const props = defineProps<Props>();

const formattedJson = computed(() => {
  return JSON.stringify(props.data, null, 2);
});
</script> 