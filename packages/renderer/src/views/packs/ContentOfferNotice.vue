<!--
  That a pack's content is waiting on the user, in its row in the list.

  **A line under the metadata, not a tag beside the version.** The row's first line is the pack's identity
  and its second is what the pack *is* — "11 entities", "UI" — so a count sitting among them reads as one
  more thing the pack contains rather than as something about the user's own data. The third line is where
  this component already puts "Failed to load: …", which is the same kind of message at a higher severity,
  so a pending decision is its quieter sibling: amber against red, and a sentence either way.

  **It says what and why, because a tooltip is where an explanation goes to die.** "1 item" needs a hover to
  mean anything; the whole row is the affordance for acting on it, so the line only has to be legible.
-->
<template>
  <p
    v-if="count > 0"
    class="text-xs text-amber-400/90 mt-1"
    data-testid="pack-content-offer-count"
  >You've changed {{ label }} this pack ships — open to review</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ count: number }>();

const label = computed(() => `${props.count} ${props.count === 1 ? 'item' : 'items'}`);
</script>
