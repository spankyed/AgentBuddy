import { onScopeDispose, shallowRef } from 'vue';
import type { SettingsTarget } from '@apackdev/sdk/types';
import { fePacks } from '@/runtime/packs';

/** Vue tracks form availability; the host registry remains framework-independent. */
export function useSettingsFormLookup() {
  const revision = shallowRef(0);
  onScopeDispose(fePacks.onChanged(() => { revision.value++; }));
  return (target: SettingsTarget) => {
    void revision.value;
    return fePacks.settingsForm(target);
  };
}
