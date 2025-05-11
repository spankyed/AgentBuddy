<template>
  <div class="py-8 text-center text-neutral-500">No content to display</div>
</template>

<script setup lang="ts">
import { applicationActor } from '@/application'
import { useSelector } from '@xstate/vue'
import { id } from '@/plugins/agent/state.ts';

const actor = applicationActor.system.get(id);
// const someState = useSelector(actor, (state) => state.context.someState)
</script> 