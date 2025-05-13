<template>
  <div class="py-8 text-center text-neutral-500">No content to display</div>
</template>

<script setup lang="ts">
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type BlankState } from '@/plugins/_blank/state.ts';

const actor: BlankState = applicationState.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)
</script> 