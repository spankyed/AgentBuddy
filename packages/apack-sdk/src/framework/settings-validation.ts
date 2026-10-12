import { Ajv, type ErrorObject } from 'ajv';
import type { SettingsDefinition, SettingsProblem, SettingsSchema, SettingsValidator } from './settings-definition.ts';
import { hasOwn } from '../utils/shared.ts';

/**
 * @internal Host/build-only: compile once when declarations change, with no pack execution or I/O.
 * Each definition has its own reference registry, so two packs may use the same schema identifier.
 */
export function _compileSettingsDefinition(definition: SettingsDefinition): SettingsValidator {
  const schemaProblems = jsonProblems(definition.schema);
  if (schemaProblems.length) throw new Error(`Settings schema must be JSON data: ${schemaProblems[0].message}`);
  if (definition.schema.type !== 'object') throw new Error('Settings schema must declare an object at its root');
  checkReferences(definition.schema);
  const ajv = new Ajv({ strict: true, allErrors: true, useDefaults: false, coerceTypes: false, removeAdditional: false });
  const validate = ajv.compile(definition.schema);
  const validator: SettingsValidator = {
    validate(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [{ path: [], keyword: 'type', message: 'Settings must be an object' }];
      }
      const problems = jsonProblems(value);
      if (problems.length) return problems;
      return validate(value) ? [] : (validate.errors ?? []).map(settingsProblem);
    },
  };
  const problems = validator.validate(definition.defaults);
  if (problems.length) {
    throw new Error(`Invalid settings defaults: ${problems.map(problem => `${problem.path.join('.') || 'root'}: ${problem.message}`).join('; ')}`);
  }
  return validator;
}

/** Validate the transport/storage contract too: Ajv treats an explicit undefined as absent. */
function jsonProblems(value: unknown): SettingsProblem[] {
  const problems: SettingsProblem[] = [];
  const ancestors = new Set<object>();
  function visit(value: unknown, path: string[]): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
    if (typeof value !== 'object' || ancestors.has(value)
      || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      problems.push({ path, keyword: 'json', message: 'Settings values must be finite, acyclic JSON data; use reset instead of undefined' });
      return;
    }
    ancestors.add(value);
    const array = Array.isArray(value);
    if (Object.getOwnPropertySymbols(value).length) problems.push({ path, keyword: 'json', message: 'Settings cannot contain symbol keys' });
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (array && key === 'length') continue;
      const index = Number(key);
      const extra = array && (String(index) !== key || !Number.isInteger(index) || index < 0 || index >= value.length);
      if (!descriptor.enumerable || !('value' in descriptor) || extra) {
        problems.push({ path: [...path, key], keyword: 'json', message: 'Settings must contain ordinary JSON data properties' });
      } else visit(descriptor.value, [...path, key]);
    }
    if (array) {
      let index = 0;
      while (index < value.length && hasOwn(value, index)) index++;
      if (index < value.length) problems.push({ path: [...path, String(index)], keyword: 'json', message: 'Settings arrays cannot contain holes' });
    }
    ancestors.delete(value);
  }
  visit(value, []);
  return problems;
}

function settingsProblem(error: ErrorObject): SettingsProblem {
  const path = error.instancePath === '' ? [] : error.instancePath.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  const property: unknown = error.keyword === 'required' ? error.params.missingProperty : error.keyword === 'additionalProperties' ? error.params.additionalProperty : undefined;
  if (typeof property === 'string') path.push(property);
  return { path, keyword: error.keyword, message: error.message ?? 'Invalid setting' };
}

/** No external/local-file references or nested bases; annotations contain data, not subschemas. */
function checkReferences(schema: SettingsSchema): void {
  function visit(value: unknown, root = false): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(child => visit(child)); return; }
    for (const [key, child] of Object.entries(value)) {
      if (['default', 'const', 'enum', 'examples'].includes(key)) continue;
      if (key === '$async') throw new Error('Settings schemas must use synchronous draft-07 validation; $async is unsupported');
      if (key === '$ref' && typeof child === 'string' && child !== '#' && !child.startsWith('#/')) {
        throw new Error(`Settings schemas require document-local JSON Pointer references: ${child}`);
      }
      if (key === '$id' && !root) throw new Error('Nested settings schema identifiers are unsupported; use definitions and document-local references');
      if (['properties', 'patternProperties', 'definitions', 'dependencies'].includes(key) && child && typeof child === 'object') {
        Object.values(child).forEach(entry => visit(entry));
      } else visit(child);
    }
  }
  visit(schema, true);
}
