// What the Settings view shows of the store's answer to the last change it sent: "Saved" only for a change the
// store stored, and the reasons when it refused one. Its own plugin's state, so it reads its own actor rather than
// the app's settings port — which is for every *other* feature.
import { onUnmounted, ref, watch } from 'vue';
import { useSelector } from '@xstate/vue';
import { usePlugin } from '@abuddy/sdk/fe';
import type { SettingsState, SettingsSave, SettingsTarget } from '@abuddy/host/fe';

/** How long a form shows "Saved" after the store stored a change */
const SAVED_SHOWN_MS = 2000;

export function useSettingsSaveStatus() {
  const actor: SettingsState = usePlugin();
  const save = useSelector(actor, (state) => state.context.save);
  const saveStatus = ref<SettingsSave['status']>(save.value.status);
  const problems = ref<string[]>(save.value.problems);
  let clearSaved: ReturnType<typeof setTimeout> | null = null;

  watch(save, (answer) => {
    saveStatus.value = answer.status;
    problems.value = answer.problems;
    if (clearSaved) clearTimeout(clearSaved);
    if (answer.status === 'saved') clearSaved = setTimeout(() => { saveStatus.value = 'idle'; }, SAVED_SHOWN_MS);
  });

  const updateSettings = (params: SettingsTarget & { path: string[]; value: unknown }) => {
    actor.send({ type: 'SETTINGS.UPDATE', ...params });
  };

  onUnmounted(() => { if (clearSaved) clearTimeout(clearSaved); });

  return { saveStatus, problems, updateSettings };
}
