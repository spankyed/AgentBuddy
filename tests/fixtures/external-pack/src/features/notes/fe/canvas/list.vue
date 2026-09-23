<script setup lang="ts">
import { useSelector } from '@xstate/vue';
import { usePlugin } from '@abuddy/sdk/fe';
import type { NotesState } from '../state';

const actor: NotesState = usePlugin();
const label = useSelector(actor, (state) => state.context.label);
</script>

<template>
  <div class="p-4">
    <h1 data-testid="fixture-notes-title">{{ label }}</h1>
  </div>
</template>
