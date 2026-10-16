import path from 'node:path';

export interface CompilerPathMapping {
  readonly captured: string;
  readonly source: string;
}

export function parseCompilerPaths(mappings: unknown): readonly CompilerPathMapping[] {
  const absolute = (value: unknown): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  if (!Array.isArray(mappings) || mappings.some(mapping => !mapping || !absolute(mapping.captured) || !absolute(mapping.source))) {
    throw new Error('Invalid captured compiler path mappings');
  }
  return mappings;
}

/** Keep capture locations out of content identity, watch subscriptions and diagnostic provenance. */
export function compilerSourcePath(file: string, mappings: readonly CompilerPathMapping[]): string {
  for (const { captured, source } of mappings) {
    const relative = path.relative(captured, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    return path.join(source, relative);
  }
  return file;
}
