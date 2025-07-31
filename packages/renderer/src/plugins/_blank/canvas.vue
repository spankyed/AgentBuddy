<template>
  <div class="text-center text-neutral-500">
    <span class="mt-8">
      No content to display
    </span>
  </div>
</template>

<script setup lang="ts">
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type BlankState } from '@/plugins/_blank/state.ts';

const actor: BlankState = applicationState.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)
</script> 