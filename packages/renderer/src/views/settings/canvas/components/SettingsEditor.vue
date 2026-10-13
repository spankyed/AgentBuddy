<template>
  <div>
    <div class="flex items-center gap-3 mb-6">
      <h2 class="text-xl font-semibold text-white">{{ title }}</h2>
      <slot name="actions" />
      <button @click="confirmReset = true" title="Reset to defaults" class="ml-auto text-neutral-400 hover:text-white">
        <RotateCcw class="w-4 h-4" />
      </button>
    </div>
    <p v-if="description" class="mb-6 text-sm text-neutral-400">{{ description }}</p>
    <template v-if="form">
      <PluginScope v-if="plugin" :plugin="plugin">
        <component :is="form" :key="formRevision" :settings="value" @update-setting="update" />
      </PluginScope>
      <component v-else :is="form" :key="formRevision" :settings="value" @update-setting="update" />
    </template>
    <div v-else class="text-sm text-neutral-400">
      <p>A custom form is unavailable for these preferences.</p>
      <button @click="openJson" class="mt-3 underline">Edit in JSON</button>
    </div>
    <div class="mt-6 text-xs" aria-live="polite">
      <p v-if="saveStatus === 'saving'" class="text-neutral-500">Saving…</p>
      <p v-else-if="saveStatus === 'saved'" class="text-green-600">Settings saved</p>
      <p v-else-if="saveStatus === 'refused'" class="text-red-400">{{ problems.join('; ') }}</p>
    </div>
    <ConfirmationDialog v-model="confirmReset" title="Reset settings"
      :description="`Forget your changes to ${title}? Its defaults will apply again.`"
      confirm-text="Reset" variant="danger" @confirm="reset" />
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, type Component } from 'vue';
import { PluginScope, usePlugin } from '@apackdev/sdk/fe';
import type { SettingUpdate, SettingsTarget } from '@apackdev/sdk/types';
import { splitRef, type FeatureRef } from '@apackdev/sdk/ids';
import { fePacks } from '@/runtime/packs';
import type { SettingsState } from '@apackdev/host/fe';
import { RotateCcw } from 'lucide-vue-next';
import ConfirmationDialog from '@apackdev/ui/design/ConfirmationDialog';
import { useSettingsSaveStatus } from '@/views/settings/save';

const props = defineProps<{
  target: SettingsTarget; title: string; description?: string;
  form?: Component; value: unknown; plugin?: FeatureRef;
}>();
const actor: SettingsState = usePlugin();
const formRevision = ref(0);
onScopeDispose(fePacks.onSettingsFormsChanged(packId => {
  const target = props.target;
  const owner = target.kind === 'pack' ? target.packId : target.kind === 'feature' ? splitRef(target.featureRef)?.packId : undefined;
  if (owner === packId) formRevision.value++;
}));
const confirmReset = ref(false);
const { saveStatus, problems, updateSettings, resetSettings } = useSettingsSaveStatus();
const update = (event: SettingUpdate) => updateSettings({
  target: props.target, path: event.path, value: event.value, condition: event.condition,
});
const reset = () => resetSettings(props.target);
function openJson() {
  actor.send({ type: 'TAB.SELECT', tab: 'general' });
  actor.send({ type: 'GENERAL_NAV.SELECT', item: 'json' });
}
</script>
