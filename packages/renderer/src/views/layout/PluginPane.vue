<template>
  <ContributionBoundary :key="plugin.id" :pack-id="packId" :owner="plugin.id" :area="area" :current="isCurrent" :reset-key="target">
    <PluginScope :plugin="plugin.id">
      <Router v-if="area === 'canvas'" :views="plugin.canvas" :target="target" />
      <component v-else :is="plugin[area]" />
    </PluginScope>
  </ContributionBoundary>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PluginScope, type Plugin } from '@apackdev/sdk/fe';
import { splitRef } from '@apackdev/sdk/ids';
import { fePacks } from '@/runtime/packs';
import ContributionBoundary from './ContributionBoundary.vue';
import Router from './PluginRouter.vue';

const props = defineProps<{ plugin: Plugin; area: 'canvas' | 'panel' | 'chat'; target?: string }>();
const packId = computed(() => splitRef(props.plugin.id)!.packId);
const isCurrent = () => fePacks.pluginBindings().get(props.plugin.id)?.binding === props.plugin;
</script>
