<script setup lang="ts">
import { useSettingsDraft } from '@apackdev/sdk/fe';
import type { SettingUpdate } from '@apackdev/sdk/types';
import type { PackSettingsOf } from '#generated/settings-fe.ts';

const props = defineProps<{ settings: PackSettingsOf<'assistant'> }>();
const emit = defineEmits<{ 'update-setting': [SettingUpdate<PackSettingsOf<'assistant'>>] }>();
const name = useSettingsDraft(() => props.settings.name);
</script>

<template>
  <label>
    Fixture assistant name
    <input v-model="name" @change="emit('update-setting', { path: ['name'], value: name })" />
  </label>
</template>
