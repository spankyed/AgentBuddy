<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { settingsTargetPath, type SettingsRecovery } from '@apackdev/sdk/types';
import { windowSettings } from '@/runtime/settings';

const props = defineProps<{ recovery: SettingsRecovery }>();
const confirming = ref<'invalid' | 'all'>();
const busy = ref(false);
const problems = ref<readonly string[]>([]);
const repaired = computed(() => props.recovery.problems.length === 0);
// A value outside any owner means the document itself is malformed, and only a complete reset fixes it.
const canResetInvalid = computed(() => props.recovery.problems.every(problem => problem.target));
watch(() => props.recovery, () => { confirming.value = undefined; });

async function reset() {
  if (!confirming.value || busy.value) return;
  busy.value = true;
  problems.value = [];
  try {
    const result = await windowSettings.recover({ version: props.recovery.version, scope: confirming.value });
    if (result.status === 'refused') problems.value = result.problems;
  } finally { busy.value = false; confirming.value = undefined; }
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
        <p>Some saved preferences do not match their current definitions.</p>
        <ul class="space-y-2">
          <li v-for="(problem, index) in recovery.problems" :key="index">
            <strong>{{ problem.target ? settingsTargetPath(problem.target).join('/') : 'Preferences document' }}</strong>
            <span v-if="problem.path.length"> · {{ problem.path.join('.') }}</span>: {{ problem.message }}
          </li>
        </ul>
        <div v-if="confirming" class="space-y-3" role="alert">
          <p>{{ confirming === 'all'
            ? 'Reset all preferences, including saved preferences for unavailable packs?'
            : 'Reset the invalid values to their defaults? Your other preferences are kept.' }} This cannot be undone.</p>
          <button :disabled="busy" @click="reset">{{ busy ? 'Resetting…' : 'Confirm reset' }}</button>
          <button :disabled="busy" @click="confirming = undefined">Cancel</button>
        </div>
        <div v-else class="flex gap-4">
          <button v-if="canResetInvalid" @click="confirming = 'invalid'">Reset invalid values</button>
          <button @click="confirming = 'all'">Reset all preferences</button>
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
