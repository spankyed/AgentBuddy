<template>
  <div class="max-w-4xl mx-auto">
    <div class="p-6 rounded-lg shadow-md bg-neutral-800 animate-fade-in">
      <div class="relative">
        <pre class="p-6 overflow-x-auto font-mono text-sm text-white rounded-lg bg-neutral-900">
          <code>{{ artifact.content }}</code>
        </pre>
        <button 
          @click="copyToClipboard"
          class="absolute p-2 transition-colors rounded top-3 right-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
          title="Copy to clipboard"
        >
          <Copy :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import type { ArtifactItem } from '@app/api';

const props = defineProps<{
  artifact: ArtifactItem;
}>();

function copyToClipboard() {
  navigator.clipboard.writeText(props.artifact.content);
}
</script>