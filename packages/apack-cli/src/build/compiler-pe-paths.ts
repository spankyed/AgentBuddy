import { win32 as path } from 'node:path';

export interface CompilerPeSystemPaths {
  readonly systemDirectory: string;
  readonly windowsDirectory: string;
}

/** Reports and realpath.native can spell the same Windows file with different namespace prefixes. */
export function pePath(file: string): string {
  const normalized = path.normalize(file);
  if (normalized.startsWith('\\\\?\\UNC\\')) return '\\\\' + normalized.slice(8);
  return normalized.startsWith('\\\\?\\') ? normalized.slice(4) : normalized;
}

export function isPeSystemPath(file: string, environment: CompilerPeSystemPaths): boolean {
  const within = (directory: string) => {
    const relative = path.relative(pePath(directory), pePath(file));
    return relative === '' || (relative !== '..' && !relative.startsWith('..\\') && !path.isAbsolute(relative));
  };
  return within(environment.systemDirectory) || within(path.join(environment.windowsDirectory, 'WinSxS'))
    || path.dirname(pePath(file)).toLowerCase() === pePath(environment.windowsDirectory).toLowerCase();
}
