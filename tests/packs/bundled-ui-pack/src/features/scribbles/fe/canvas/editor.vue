<script setup lang="ts">
import { ref } from 'vue';
// Bundled into this pack (apack.json fe.bundleUi); ProseMirror and tiptap's core still come from the host
import TiptapEditor from '@apack/ui/components/tiptap/TiptapEditor';
// A component whose classes name the host theme (primary-*): without @apack/ui's Tailwind preset
// its accent silently gets no CSS, which fe-bundler-ui-theme.spec.ts checks for
import Button from '@apack/ui/design/button';

const text = ref('Bundled editor');
</script>

<template>
  <div data-testid="scribbles-canvas" class="flex flex-col gap-3 p-[13px]">
    <div data-testid="scribbles-editor">
      <TiptapEditor v-model="text" mode="editor" />
    </div>
    <p data-testid="scribbles-text" class="text-sm">{{ text }}</p>
    <Button data-testid="scribbles-button" variant="primary">Themed</Button>
  </div>
</template>
