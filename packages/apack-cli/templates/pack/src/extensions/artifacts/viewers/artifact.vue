<script setup lang="ts">
import type { ArtifactItem } from '@apack/sdk/artifacts';
import { __ICON__ } from 'lucide-vue-next';

defineProps<{ artifact: ArtifactItem }>();
</script>

<template>
  <div class="p-4">
    <div class="flex items-center gap-2 mb-2">
      <__ICON__ class="w-4 h-4" />
      <span class="text-sm font-medium">{{ artifact.title }}</span>
    </div>
    <pre class="text-xs text-neutral-400">{{ artifact.content }}</pre>
  </div>
</template>
