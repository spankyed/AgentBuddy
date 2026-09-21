<script setup lang="ts">
import { actorOf } from '#generated/fe'
import { useSelector } from '@xstate/vue';
import { useActorSystem } from '@abuddy/sdk/fe';
import { id, type NotesState } from '../state';

const actor: NotesState = actorOf(id);
const label = useSelector(actor, (state) => state.context.label);
</script>

<template>
  <div class="p-4">
    <h1 data-testid="fixture-notes-title">{{ label }}</h1>
  </div>
</template>
