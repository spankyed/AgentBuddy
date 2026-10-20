<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue';
import { settingsTargetPath, type SettingsRecovery, type SettingsTarget } from '@apackdev/sdk/types';
import { windowSettings } from '@/runtime/settings';

const props = defineProps<{ recovery: SettingsRecovery }>();
const selected = ref<string[]>([]);
const confirmReset = ref<'selected' | 'all'>();
const busy = ref(false);
const repaired = computed(() => props.recovery.problems.length === 0);
const problems = ref<readonly string[]>([]);
const groups = computed(() => [...new Map(props.recovery.problems.flatMap(problem => problem.target
  ? [[JSON.stringify(settingsTargetPath(problem.target)), problem.target] as const] : [])).entries()]);
const canResetGroups = computed(() => props.recovery.problems.every(problem => problem.target));
watch(() => props.recovery, () => {
  selected.value = groups.value.map(([key]) => key);
  confirmReset.value = undefined;
}, { immediate: true });

async function reset() {
  if (!confirmReset.value || busy.value) return;
  const reset: 'all' | SettingsTarget[] = confirmReset.value === 'all' ? 'all'
    : groups.value.filter(([key]) => selected.value.includes(key)).map(([, target]) => toRaw(target));
  busy.value = true;
  problems.value = [];
  try {
    const result = await windowSettings.recover({ version: { ...props.recovery.version }, reset });
    if (result.status === 'refused') problems.value = result.problems;
  } finally { busy.value = false; confirmReset.value = undefined; }
}
async function restart() {
  try {
    const relaunch = window.electronAPI?.apiStatus.relaunch;
    if (!relaunch) throw new Error('Close and reopen apack to finish recovery.');
    await relaunch();
  }
  catch (error) { problems.value = [String(error)]; }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <section class="max-w-xl w-full space-y-5" aria-labelledby="recovery-title">
      <h1 id="recovery-title" class="text-xl font-semibold">{{ repaired ? 'Settings repaired' : 'Settings need attention' }}</h1>
      <template v-if="!repaired">
        <p>Some saved preferences do not match their current definitions. Reset the affected groups to their defaults to continue.</p>
        <ul class="space-y-2">
          <li v-for="(problem, index) in recovery.problems" :key="index">
            <strong>{{ problem.target ? settingsTargetPath(problem.target).join('/') : 'Preferences document' }}</strong>
            <span v-if="problem.path.length"> · {{ problem.path.join('.') }}</span>: {{ problem.message }}
          </li>
        </ul>
        <fieldset v-if="canResetGroups" :disabled="busy">
          <legend class="mb-2">Groups to reset</legend>
          <label v-for="[key, target] in groups" :key="key" class="block">
            <input v-model="selected" type="checkbox" :value="key"> {{ settingsTargetPath(target).join('/') }}
          </label>
        </fieldset>
        <p v-else>The document structure is invalid. Recovery requires resetting all preferences.</p>
        <div v-if="confirmReset" class="space-y-3" role="alert">
          <p>{{ confirmReset === 'all' ? 'Reset all preferences, including saved preferences for unavailable packs?' : 'Reset all preferences in the selected groups? Other groups will be kept.' }} This cannot be undone.</p>
          <button :disabled="busy" @click="reset">{{ busy ? 'Resetting…' : 'Confirm reset' }}</button>
          <button :disabled="busy" @click="confirmReset = undefined">Cancel</button>
        </div>
        <div v-else class="flex gap-4">
          <button v-if="canResetGroups" :disabled="!selected.length" @click="confirmReset = 'selected'">Reset selected groups</button>
          <button @click="confirmReset = 'all'">Reset all preferences</button>
        </div>
      </template>
      <template v-else>
        <p>Your settings were saved. Restart apack to start your packs.</p>
        <button @click="restart">Restart app</button>
      </template>
      <p v-for="problem in problems" :key="problem" role="alert">{{ problem }}</p>
    </section>
  </main>
</template>
