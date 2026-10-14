import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACK_LAYOUT, PACK_LAYOUT_VERSION, type PackIntegrity } from './layout-paths.ts';

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** The receipt's content identity, shared by admission and revisioned asset delivery. */
export function packBuildRevision(integrity: PackIntegrity): string {
  const files = Object.entries(integrity.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return sha256(JSON.stringify({ formatVersion: integrity.formatVersion, files }));
}

/** Serve exactly the requested accepted bytes; never renew a receipt or return a path to read later. */
export function readPackAsset(dir: string, packId: string, revision: string, file: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(revision) || !file || file.includes('\\')
    || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid pack asset request');
  if (fs.lstatSync(dir).isSymbolicLink() || !fs.lstatSync(path.join(dir, PACK_LAYOUT.integrity)).isFile()) throw new Error('Pack asset receipt is not a regular installed file');
  const integrity = readPackIntegrity(dir);
  if (!integrity || integrity.id !== packId || typeof integrity.formatVersion !== 'number'
    || !Number.isFinite(integrity.formatVersion) || integrity.formatVersion !== PACK_LAYOUT_VERSION
    || !integrity.files || typeof integrity.files !== 'object' || Array.isArray(integrity.files)
    || packBuildRevision(integrity) !== revision) throw new Error(`Pack "${packId}" build changed; reload its frontend`);
  const expected = Object.hasOwn(integrity.files, file) ? integrity.files[file] : undefined;
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Pack "${packId}" does not declare asset "${file}"`);
  const root = fs.realpathSync(dir);
  const target = path.join(root, file);
  if (fs.realpathSync(path.dirname(target)) !== path.dirname(target)) throw new Error('Pack asset path contains a symbolic link');
  if (!fs.lstatSync(target).isFile()) throw new Error('Pack asset is not a regular file');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Pack asset is not a regular file');
    const bytes = fs.readFileSync(fd);
    if (sha256(bytes) !== expected) throw new Error(`Pack "${packId}" asset "${file}" changed; rebuild and reinstall the complete pack`);
    return bytes;
  } finally { fs.closeSync(fd); }
}

export function readPackIntegrity(dir: string): PackIntegrity {
  const integrityPath = path.join(dir, PACK_LAYOUT.integrity);
  if (!fs.existsSync(integrityPath)) throw new Error(`Not a pack layout: no ${PACK_LAYOUT.integrity} in ${dir}`);
  return JSON.parse(fs.readFileSync(integrityPath, 'utf-8'));
}
