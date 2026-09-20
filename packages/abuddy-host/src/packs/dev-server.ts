/**
 * `abuddy dev` state: which packs have a Vite dev server the app's `pack://` handler proxies their
 * frontend requests to. It lives in the data dir beside the packs, never inside an installed pack
 * directory, which holds exactly the verified pack files and is replaced on every install.
 *
 *   <userDataDir>/pack-dev-servers/<packId>.json   { port, pid }
 *
 * A marker means a dev server is running, never that anything on disk is current, so nothing may read
 * it to skip a build or a sync. `abuddy dev` writes only to the development data dir, so a test run
 * reads its own and never sees one. (N4 in
 * `docs/archive/issues/postmortem-external-pack-calendar-extraction.md`: a run that skipped both and tested a
 * stale copy.)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { _recordIsStale } from '@abuddy/sdk/env';

export interface DevServerMarker {
  port: number;
  /** The `abuddy dev` process serving the pack */
  pid: number;
}

const DEV_SERVERS_DIR = 'pack-dev-servers';

export function devServerMarkerPath(userDataDir: string, packId: string): string {
  return path.join(userDataDir, DEV_SERVERS_DIR, `${packId}.json`);
}

/** Records that pack `packId`'s frontend is served on `marker.port`; returns the marker's path. */
export function writeDevServerMarker(userDataDir: string, packId: string, marker: DevServerMarker): string {
  const file = devServerMarkerPath(userDataDir, packId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Written aside and renamed, so the protocol handler never reads a half-written marker
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(marker));
  fs.renameSync(temp, file);
  return file;
}

export function removeDevServerMarker(userDataDir: string, packId: string): void {
  fs.rmSync(devServerMarkerPath(userDataDir, packId), { force: true });
}

/**
 * The dev server URL for a `pack://<packId><filePath>` request, or null when the pack has no dev
 * server. Throws when the marker exists but doesn't name a valid port.
 */
export function devServerUrl(userDataDir: string, packId: string, filePath: string): string | null {
  const markerPath = devServerMarkerPath(userDataDir, packId);
  let raw: string;
  try {
    raw = fs.readFileSync(markerPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let marker: Partial<DevServerMarker>;
  try {
    marker = JSON.parse(raw) as Partial<DevServerMarker>;
  } catch {
    throw new Error(`Invalid dev server marker for ${packId}: not JSON`);
  }
  const port = Number(marker.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid dev server marker for ${packId}: port ${port}`);
  }
  const pid = Number(marker.pid);
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`Invalid dev server marker for ${packId}: pid ${marker.pid}`);
  }
  // `abuddy dev` removes this on the way out, so one still here after it crashed names a port nothing is
  // listening on — and from here that looks exactly like a live one. The pack's frontend would fail to
  // load with a connection error and nothing pointing at this file. Its pid is what tells them apart.
  if (_recordIsStale(markerPath, pid)) return null;
  return `http://localhost:${port}${filePath}`;
}
