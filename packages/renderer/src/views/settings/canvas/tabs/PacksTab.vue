<template>
  <div class="flex h-full">
    <div class="w-64 p-2 border-r border-neutral-800 overflow-auto">
      <h3 class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase">Pack preferences</h3>
      <button v-for="group in groups" :key="group.id" @click="selectedId = group.id"
        class="w-full px-3 py-2 rounded text-left text-sm mb-0.5"
        :class="selected?.id === group.id ? 'bg-blue-500/20 text-blue-400' : 'text-neutral-400 hover:text-white'">
        {{ group.label }}
        <span class="block text-xs text-neutral-500">{{ group.id }}</span>
      </button>
      <p v-if="!groups.length" class="p-3 text-sm text-neutral-500">No pack preferences declared.</p>
    </div>
    <div class="flex-1 p-8 overflow-auto">
      <SettingsEditor v-if="selected" :key="selected.id" :target="selected.target" :title="selected.label"
        :description="selected.definition.description" :form="selected.form"
        :value="snapshot?.values.packs[selected.target.packId]?.[selected.target.groupId]" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWindowSettingsSnapshot } from '@/runtime/settings';
import { useSettingsFormLookup } from '@/views/settings/forms';
import SettingsEditor from '../components/SettingsEditor.vue';

const snapshot = useWindowSettingsSnapshot();
const settingsForm = useSettingsFormLookup();
const selectedId = ref<string>();
const groups = computed(() => Object.entries(snapshot.value?.catalog.packs ?? {}).flatMap(([packId, definitions]) =>
  Object.entries(definitions).map(([groupId, definition]) => {
    const target = { kind: 'pack' as const, packId, groupId };
    return { id: `${packId}/${groupId}`, target, definition, label: definition.title ?? groupId, form: settingsForm(target) };
  })));
const selected = computed(() => groups.value.find(group => group.id === selectedId.value) ?? groups.value[0]);
</script>
