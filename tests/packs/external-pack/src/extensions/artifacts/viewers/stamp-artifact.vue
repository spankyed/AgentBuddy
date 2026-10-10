<script setup lang="ts">
import type { ArtifactItem } from '@abuddy/sdk';

defineProps<{ artifact: ArtifactItem }>();
</script>

<template>
  <div class="p-2 text-sm" data-testid="stamp-artifact">{{ artifact.title }}</div>
</template>
