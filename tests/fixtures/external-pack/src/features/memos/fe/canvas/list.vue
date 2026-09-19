<script setup lang="ts">
import { ref } from 'vue';
import { useSelector } from '@xstate/vue';
import { useActorSystem } from '@abuddy/sdk/fe';
// Comes from the host app at runtime, not bundled into the pack
import TiptapEditor from '@abuddy/ui/components/tiptap/TiptapEditor';
import { id, type MemosState } from '../state';

const actor: MemosState = useActorSystem().get(id);
const memos = useSelector(actor, (state) => state.context.memos);
const draft = ref('');

function add() {
  const text = draft.value.trim();
  if (!text) return;
  actor.send({ type: 'MEMOS.ADD', text });
  draft.value = '';
}
</script>

<template>
  <!-- p-[13px] only exists in the pack's own Tailwind output, so tests can tell pack CSS loaded -->
  <div data-testid="memos-canvas" class="flex flex-col gap-3 p-[13px]">
    <form class="flex gap-2" @submit.prevent="add">
      <input
        v-model="draft"
        data-testid="memo-input"
        type="text"
        placeholder="New memo"
        class="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
      />
      <button data-testid="memo-add" type="submit" class="rounded-md bg-neutral-800 px-3 py-1.5 text-sm">
        Add
      </button>
    </form>
    <div data-testid="memo-preview">
      <TiptapEditor mode="viewer" :model-value="draft || 'Memo preview'" />
    </div>
    <ul data-testid="memo-list" class="flex flex-col gap-1">
      <li v-for="memo in memos" :key="memo.id" class="text-sm">{{ memo.text }}</li>
    </ul>
  </div>
</template>
