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
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';

const actor: AgentState = applicationState.system.get(id);
const items = useSelector(actor, (state) => state.context.currentThread.contextItems)
</script>

<style lang="scss" module>
</style> 