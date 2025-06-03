<template>
  <Flow/>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type BlankState } from '@/plugins/_blank/state.ts';
import Flow from './flow.vue';

const actor: BlankState = applicationState.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)
</script> 