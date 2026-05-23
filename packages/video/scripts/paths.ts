import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const videoPackageDir = packageDir;
export const repoRoot = path.resolve(packageDir, '../..');

export function demoOutDir(demoId: string) {
  return path.join(videoPackageDir, 'out', demoId);
}

export function demoCaptureDir(demoId: string) {
  return path.join(demoOutDir(demoId), 'captures');
}

export function demoCapturePath(demoId: string, sceneId: string) {
  return path.join(demoCaptureDir(demoId), `${sceneId}.png`);
}

export function demoCaptureMetadataPath(demoId: string, sceneId: string) {
  return path.join(demoCaptureDir(demoId), `${sceneId}.json`);
}

export function demoOutputPath(demoId: string) {
  return path.join(demoOutDir(demoId), `${demoId}.mp4`);
}
