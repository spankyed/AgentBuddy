<!--
  How many decisions a pack's content is waiting on, in its row in the list.

  A count rather than a dot, because the two say different things and only one of them is worth
  interrupting someone over: a dot says something is there, a count says how much — and the whole risk of
  drawing this at all is a badge nobody cares about, so it should at least be specific. The detail is where
  they are answered; this only says the pack has some.
-->
<template>
  <span
    v-if="count > 0"
    class="px-1.5 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded"
    :title="`You've changed ${label} this pack ships — open it to take the pack's version or keep yours`"
    data-testid="pack-content-offer-count"
  >{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ count: number }>();

const label = computed(() => `${props.count} ${props.count === 1 ? 'item' : 'items'}`);
</script>
