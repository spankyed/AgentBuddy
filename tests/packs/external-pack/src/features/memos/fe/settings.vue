<script setup lang="ts">
// The host renders this feature's declared form and fixes the owner of each emitted update.
const props = defineProps<{ settings?: { listTitle?: string } }>();
const emit = defineEmits<{ 'update-setting': [{ path: string[]; value: unknown }] }>();

function rename(event: Event) {
  emit('update-setting', { path: ['listTitle'], value: (event.target as HTMLInputElement).value });
}
</script>

<template>
  <label class="p-4 flex flex-col gap-1 text-sm">
    List title
    <input data-testid="memos-list-title" :value="props.settings?.listTitle ?? ''" @change="rename" />
  </label>
</template>
