<template>
  <div class="max-w-4xl">
    <div class="p-6 rounded-lg shadow-md bg-neutral-850 animate-fade-in">
      <div class="relative">
        <pre class="p-6 overflow-x-auto font-mono text-sm text-white rounded-lg bg-neutral-900">
          <code>{{ artifact.content }}</code>
        </pre>
        <div class="absolute top-3 right-3">
          <CopyButton :text="typeof artifact.content === 'string' ? artifact.content : ''" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArtifactItem } from '@app/api';
import CopyButton from '@/core/components/design/CopyButton.vue'

defineProps<{
  artifact: ArtifactItem;
}>();
</script>
