<template>
  <label class="block max-w-lg space-y-2">
    <span class="text-sm text-neutral-300">Assistant name</span>
    <input v-model="name" @change="save" class="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white" />
  </label>
</template>

<script setup lang="ts">
import { useSettingsDraft } from '@apackdev/sdk/fe';
import type { SettingUpdate } from '@apackdev/sdk/types';
import type { PackSettingsOf } from '#generated/settings-fe.ts';

const props = defineProps<{ settings: PackSettingsOf<'assistant'> }>();
const emit = defineEmits<{ 'update-setting': [update: SettingUpdate<PackSettingsOf<'assistant'>>] }>();
const name = useSettingsDraft(() => props.settings.name);
const save = () => emit('update-setting', { path: ['name'], value: name.value });
</script>
