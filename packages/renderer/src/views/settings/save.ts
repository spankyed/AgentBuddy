import { onUnmounted, ref, watch } from 'vue';
import { useSettingsSave } from '@apackdev/sdk/fe';
import type { SettingsTarget, SettingsWriteCondition } from '@apackdev/sdk/types';
import { settingsPort } from '@/runtime/settings';

/** Save feedback belongs to this form's requests, not the Settings view actor. */
export function useSettingsSaveStatus() {
  const { save, update, reset } = useSettingsSave(settingsPort);
  const saveStatus = ref(save.value.status);
  const problems = ref<readonly string[]>([]);
  let clearSaved: ReturnType<typeof setTimeout> | undefined;
  watch(save, answer => {
    saveStatus.value = answer.status;
    problems.value = answer.problems;
    clearTimeout(clearSaved);
    if (answer.status === 'saved') clearSaved = setTimeout(() => { saveStatus.value = 'idle'; }, 2000);
  });
  onUnmounted(() => clearTimeout(clearSaved));
  return {
    saveStatus, problems, resetSettings: reset,
    updateSettings: ({ target, path, value, condition }: { target: SettingsTarget; path: readonly string[]; value: unknown; condition?: SettingsWriteCondition }) =>
      update(target, path, value, condition),
  };
}
