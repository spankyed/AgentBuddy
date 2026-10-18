import path from 'node:path';

export interface CompilerPathMapping {
  readonly captured: string;
  readonly source: string;
}

/** Keep drive-root identity stable across Node's resolve/basename handling of extended paths. */
export function resolveCompilerPath(file: string): string {
  return /^\\\\\?\\[a-z]:\\$/i.test(file) ? file.slice(4) : path.resolve(file);
}

/** Compare DOS and extended Windows spellings without removing extended-path component semantics. */
export function relativeCompilerPath(from: string, to: string): string {
  return path.relative(path.toNamespacedPath(from), path.toNamespacedPath(to));
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
    const relative = relativeCompilerPath(captured, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    return path.join(source, relative);
  }
  return file;
}

/** Project diagnostic locations without reading files or allocating a compiler tree. */
export function compilerDiagnostic(message: string, mappings: readonly CompilerPathMapping[]): string {
  for (const { source, captured } of mappings) {
    const target = path.join(source, path.sep);
    const relative = relativeCompilerPath(process.cwd(), captured);
    if (relative) message = message.split(relative + path.sep).join(target);
    message = message.split(captured + path.sep).join(target);
  }
  return message;
}
