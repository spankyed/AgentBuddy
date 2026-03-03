<template>
  <div class="items-center hidden gap-1 mx-2 text-xs text-neutral-500 sm:flex dark:text-neutral-400">
    <Keyboard class="w-3 h-3" />
    <span>{{ hotkeyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Keyboard } from 'lucide-vue-next';
import type { KeyboardShortcut } from '@app/api';

interface Props {
  executeQuery?: KeyboardShortcut;
}

const props = defineProps<Props>();

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

const hotkeyText = computed(() => {
  if (!props.executeQuery) {
    // Default fallback
    return `${isMac ? 'Cmd' : 'Ctrl'} + Enter to run`;
  }

  const { key, modifiers } = props.executeQuery;

  // Format modifiers
  const formattedModifiers = modifiers.map(mod => {
    switch (mod.toLowerCase()) {
      case 'cmd':
      case 'command':
      case 'meta':
        return isMac ? 'Cmd' : 'Ctrl';
      case 'ctrl':
      case 'control':
        return 'Ctrl';
      case 'alt':
      case 'option':
        return isMac ? 'Option' : 'Alt';
      case 'shift':
        return 'Shift';
      default:
        return mod;
    }
  });

  // Format key
  const formattedKey = key === 'Enter' ? 'Enter' : key;

  // Combine modifiers and key
  const shortcut = [...formattedModifiers, formattedKey].join(' + ');

  return `${shortcut} to run`;
});
</script>
