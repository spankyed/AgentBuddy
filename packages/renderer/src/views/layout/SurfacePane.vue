<template>
  <ContributionBoundary :key="surface.id" :pack-id="packId" :owner="surface.id" :area="area" :current="isCurrent" :reset-key="target">
    <SurfaceScope :surface="surface.id">
      <Router v-if="area === 'canvas'" :views="surface.canvas" :target="target" />
      <component v-else :is="surface[area]" />
    </SurfaceScope>
  </ContributionBoundary>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SurfaceScope, type Surface } from '@apackdev/sdk/fe';
import { splitRef } from '@apackdev/sdk/ids';
import { fePacks } from '@/runtime/packs';
import ContributionBoundary from './ContributionBoundary.vue';
import Router from './SurfaceRouter.vue';

const props = defineProps<{ surface: Surface; area: 'canvas' | 'panel' | 'chat'; target?: string }>();
const packId = computed(() => splitRef(props.surface.id)!.packId);
const isCurrent = () => fePacks.surfaceBindings().get(props.surface.id)?.binding === props.surface;
</script>
