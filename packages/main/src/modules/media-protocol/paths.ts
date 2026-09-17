import { app } from 'electron';
import { join } from 'node:path';
import { getAppContext } from '../../app-context.js';

/**
 * The folder the API's `getMediaPath()` (`@abuddy/sdk/utils`) uses: `<data dir>/media` for the packaged app,
 * `<data dir>/.data/media` otherwise, the NODE_ENV `api-server/config.ts` gives the API process
 */
export function getMediaBasePath(): string {
  const { userDataDir } = getAppContext();
  return app.isPackaged ? join(userDataDir, 'media') : join(userDataDir, '.data', 'media');
}

export function resolveMediaFilePath(entityId: string, filename: string): string {
  return join(getMediaBasePath(), entityId, filename);
}
