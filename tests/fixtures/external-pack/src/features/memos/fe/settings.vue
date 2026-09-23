<script setup lang="ts">
// The memos plugin's settings, which the app's settings plugin renders: a change goes up as `update-setting`, and the
// settings plugin stores it under this plugin's ref
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
