import { captureStepBinding } from '../packs/step-bindings.ts';
import { _settingsJsonProblems } from '@apackdev/sdk/framework';
import type { frontendBindingProblem } from './declaration-binding.ts';
import type { PackFERegistration } from '@apackdev/sdk/fe';
import { isPlainObject } from '@apackdev/sdk/utils/pure';

/** Own binding membership before validation; retain executable component/extension/callback objects. */
export function captureFrontendBindings(registration: PackFERegistration, declarations: Parameters<typeof frontendBindingProblem>[0]): PackFERegistration {
  const captured = { ...registration };
  for (const field of ['settingsForms', 'appExtensions'] as const) {
    if (isPlainObject(captured[field])) captured[field] = Object.freeze({ ...captured[field] });
  }
  if (Array.isArray(captured.artifacts)) captured.artifacts = captured.artifacts.map(captureFacet);
  if (Array.isArray(captured.blocks)) captured.blocks = captured.blocks.map(captureFacet);
  if (Array.isArray(captured.steps)) captured.steps = captured.steps.map(captureStepBinding);
  if (isPlainObject(captured.tiptapPlugins)) captured.tiptapPlugins = Object.fromEntries(Object.entries(captured.tiptapPlugins).map(([id, plugin]) => {
    if (!isPlainObject(plugin)) return [id, plugin];
    const value = { ...plugin };
    if (isPlainObject(value.extensions)) value.extensions = Object.freeze({ ...value.extensions });
    if (isPlainObject(value.popups)) value.popups = Object.freeze({ ...value.popups });
    return [id, Object.freeze(value)];
  }));
  if (!isPlainObject(captured.features)) return captured;
  captured.features = Object.fromEntries(Object.entries(captured.features).map(([id, feature]) => {
    if (!isPlainObject(feature)) return [id, feature];
    const copy = { ...feature };
    if (isPlainObject(copy.plugin)) {
      const plugin = { ...copy.plugin };
      const canvas = declarations.features?.[id]?.plugin?.canvas;
      if (canvas && typeof canvas === 'object' && 'routes' in canvas && isPlainObject(plugin.canvas)) {
        plugin.canvas = Object.freeze({ ...plugin.canvas });
      }
      if (isPlainObject(plugin.options)) plugin.options = Object.freeze({ ...plugin.options });
      if (Array.isArray(plugin.hotkeys)) plugin.hotkeys = Object.freeze(plugin.hotkeys.map(hotkey =>
        isPlainObject(hotkey) ? Object.freeze({ ...hotkey }) : hotkey));
      if (isPlainObject(plugin.fallbackPanel)) plugin.fallbackPanel = Object.freeze({ ...plugin.fallbackPanel,
        ...(isPlainObject(plugin.fallbackPanel.toggle) && { toggle: Object.freeze({ ...plugin.fallbackPanel.toggle }) }) });
      copy.plugin = Object.freeze(plugin);
    }
    if (isPlainObject(copy.references)) {
      const references = { ...copy.references };
      if (isPlainObject(references.types)) references.types = Object.fromEntries(Object.entries(references.types).map(([name, type]) => {
        if (!isPlainObject(type)) return [name, type];
        const value = { ...type };
        if (Array.isArray(value.svgElements)) {
          if (_settingsJsonProblems(value.svgElements).length) throw new Error('Reference SVG elements must contain JSON data properties');
          value.svgElements = structuredClone(value.svgElements);
        }
        return [name, value];
      }));
      if (isPlainObject(references.categories)) references.categories = Object.fromEntries(Object.entries(references.categories)
        .map(([name, category]) => [name, isPlainObject(category) ? { ...category } : category]));
      copy.references = references;
    }
    return [id, copy];
  }));
  return captured;
}

function captureFacet<T extends { fe?: unknown }>(value: T): T {
  if (!isPlainObject(value)) return value;
  const copy = { ...value };
  return Object.freeze({ ...copy, ...(isPlainObject(copy.fe) && { fe: Object.freeze({ ...copy.fe }) }) });
}
