<script setup lang="ts">
import { ref } from 'vue';
// Bundled into this pack (abuddy.json fe.bundleUi); ProseMirror and tiptap's core still come from the host
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';

const text = ref('Bundled editor');
</script>

<template>
  <div data-testid="scribbles-canvas" class="flex flex-col gap-3 p-[13px]">
    <div data-testid="scribbles-editor">
      <TiptapEditor v-model="text" mode="editor" />
    </div>
    <p data-testid="scribbles-text" class="text-sm">{{ text }}</p>
  </div>
</template>
