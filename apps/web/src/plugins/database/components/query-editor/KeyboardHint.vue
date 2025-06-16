<template>
  <div class="items-center hidden gap-1 mr-2 text-xs text-gray-500 sm:flex dark:text-gray-400">
    <Keyboard class="w-3 h-3" />
    <span>{{ isMac ? 'Cmd' : 'Ctrl' }} + Enter to run</span>
  </div>
</template>

<script setup lang="ts">
import { Keyboard } from 'lucide-vue-next';

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
</script> 