<template>
  <div class="py-8 text-center text-neutral-500">No agent content to display</div>
</template>

<script setup lang="ts">
import { Copy } from 'lucide-vue-next';
import type { CanvasContent } from '../../helpers/types';

interface Props {
  content: CanvasContent;
}

defineProps<Props>();
</script> 