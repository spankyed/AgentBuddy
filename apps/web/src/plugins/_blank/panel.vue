<template>
  <div class="flex items-center justify-between border-b border-neutral-800">
    <h2 class="text-sm font-medium text-neutral-200">No context to display</h2>
  </div>
</template>

<script setup lang="ts">
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id, type BlankState } from '@/plugins/_blank/state.ts';

const actor: BlankState = applicationActor.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)
</script> 