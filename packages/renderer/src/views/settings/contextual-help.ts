import { computed } from 'vue';
import type { SnapshotFrom } from 'xstate';
import type { HelpArticle } from '@apackdev/sdk/framework';
import { useUntypedPluginState, openHelp } from '@apackdev/sdk/fe';
import { splitRef } from '@apackdev/sdk/ids';
import { HOST, type SettingsState } from '@apackdev/host/fe';

/** Read the same live catalog as Help; contextual links disappear when their pack unloads. */
export function useContextualHelp() {
  const articles = useUntypedPluginState<SnapshotFrom<SettingsState>, HelpArticle[]>(HOST.settings, s => s.context.help.catalog.articles);
  const features = computed(() => new Set((articles.value ?? []).flatMap(a => (a.features ?? []).map(f => `${a.packId}/${f}`))));
  return {
    hasHelp: (ref: string) => features.value.has(ref),
    openFeatureHelp: (ref: string) => { const target = splitRef(ref); if (target) openHelp(target); },
  };
}
