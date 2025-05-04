<template>
  <!-- Agent Panel Content -->
  <ContextItem 
    v-for="item in items" 
    :key="item.id" 
    :item="item" 
  />
  <!-- <h2 class="text-sm font-medium text-neutral-200">No Agent Context</h2> -->
</template>

<script setup lang="ts">
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import ContextItem from './item.vue'
import type { ContextItem as ContextItemType } from '../types'
import { ref } from 'vue'
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id } from '@/plugins/agent/state.ts';

const actor = applicationActor.system.get(id);
const items: ContextItemType[] = useSelector(actor, (state) => state.context.contextItems)
</script>

<style lang="scss" module>
</style> 