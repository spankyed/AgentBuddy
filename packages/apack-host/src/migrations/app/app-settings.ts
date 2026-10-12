// Stored 0.3.14 settings copied the whole baseline; equal legacy values are inherited defaults.
// Destination overrides win. Unknown legacy values remain stored until their owner migrates them.
import { deepMerge, hasOwn, isPlainObject } from '@apackdev/sdk/utils/pure';
import { changesFrom } from '../../features/settings/be/document.ts';

const DEFAULTS_0314 = {
  personal: {}, projects: [],
  hotkeys: {
    switchPluginUp: { key: 'ArrowUp', modifiers: ['cmd', 'option'] },
    switchPluginDown: { key: 'ArrowDown', modifiers: ['cmd', 'option'] },
    toggleInspectionPanel: { key: 'b', modifiers: ['cmd'] },
  },
};

/** Move known app overrides without reading effective values or touching other owners' data. */
export function moveAppSettings(data: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(data.general)) return data;
  // Do not erase a malformed destination to force a successful migration.
  if (hasOwn(data, 'app') && !isPlainObject(data.app)) return data;
  const { personal, projects, application, ...remaining } = data.general;
  const app: Record<string, unknown> = {};
  if (hasOwn(data.general, 'personal')) app.personal = personal;
  if (hasOwn(data.general, 'projects')) {
    app.projects = isPlainObject(projects) && Array.isArray(projects.projects) ? projects.projects : projects;
  }
  if (isPlainObject(application)) {
    if (hasOwn(application, 'hotkeys')) app.hotkeys = application.hotkeys;
    const { hotkeys: _hotkeys, ...other } = application;
    if (Object.keys(other).length) remaining.application = other;
  } else if (hasOwn(data.general, 'application')) remaining.application = application;
  const moved = deepMerge(changesFrom(DEFAULTS_0314, app) ?? {}, data.app ?? {}) as Record<string, unknown>;
  const { general: _general, ...next } = data;
  if (Object.keys(remaining).length) next.general = remaining;
  if (Object.keys(moved).length || hasOwn(data, 'app')) next.app = moved;
  return next;
}
