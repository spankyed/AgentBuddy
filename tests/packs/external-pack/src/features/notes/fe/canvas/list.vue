<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { useSurface } from '@apackdev/sdk/fe';
import type { NotesState } from '../state.ts';

const actor: NotesState = useSurface();
const label = useSelector(actor, (state) => state.context.label);
</script>

<template>
  <div class="p-4">
    <h1 data-testid="fixture-notes-title">{{ label }}</h1>
  </div>
</template>
