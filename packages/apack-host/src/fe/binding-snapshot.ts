import type { PackFERegistration } from '@apackdev/sdk/fe';
import { isPlainObject } from '@apackdev/sdk/utils/pure';

/** Own binding membership before validation; retain executable component/extension/callback objects. */
export function captureFrontendBindings(registration: PackFERegistration): PackFERegistration {
  const captured = { ...registration };
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
    if (isPlainObject(copy.references)) {
      const references = { ...copy.references };
      if (isPlainObject(references.types)) references.types = Object.fromEntries(Object.entries(references.types).map(([name, type]) => {
        if (!isPlainObject(type)) return [name, type];
        const value = { ...type };
        if (Array.isArray(value.svgElements)) value.svgElements = structuredClone(value.svgElements);
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
