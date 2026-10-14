export const _MODULE_REFERENCE_PATTERN = /^([^#]+)#([A-Za-z_$][\w$]*)$/;

/** @internal Parse shared module/export syntax; callers validate type or executable purpose. */
export function _parseModuleReference(target: string, label: string, defaultExport?: 'default'): { source: string; exportName: string } {
  const reference = defaultExport && !target.includes('#') ? `${target}#${defaultExport}` : target;
  const match = _MODULE_REFERENCE_PATTERN.exec(reference);
  if (!match) throw new Error(`${label}: "${target}" must name its export, as "path#exportName"`);
  return { source: match[1]!.split('\\').join('/'), exportName: match[2]! };
}
