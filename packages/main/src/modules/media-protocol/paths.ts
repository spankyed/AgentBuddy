import { app } from 'electron';
import { join } from 'node:path';

export function getMediaBasePath(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'media');
  }
  return join(process.cwd(), 'packages', 'api', 'src', 'core', 'persistence', 'data', 'untracked', 'media');
}

export function resolveMediaFilePath(entityId: string, filename: string): string {
  return join(getMediaBasePath(), entityId, filename);
}
