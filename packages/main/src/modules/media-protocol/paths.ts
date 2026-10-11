import { join } from 'node:path';
import { getAppContext } from '../../app-context.ts';

/**
 * The folder the API's `_getMediaPath()` (`@apack/sdk/utils`) uses. It used to branch on `app.isPackaged` to
 * follow the two layouts, which meant main and the API each held the rule and a mismatch served every image
 * a 404. There is one layout now, so both just join onto the directory the app owns.
 */
export function getMediaBasePath(): string {
  return join(getAppContext().appDir, 'media');
}

export function resolveMediaFilePath(entityId: string, filename: string): string {
  return join(getMediaBasePath(), entityId, filename);
}
