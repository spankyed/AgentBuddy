/**
 * Where a running engine says it is, for the agent that has to find it.
 *
 * The address cannot be agreed in advance — the port is the OS's and the token is minted per session —
 * so it is published to a file at a path that is known, and removed when the session ends.
 *
 * **It goes in Playwright's `outputDir`, which is wiped at the start of every run.** That is the whole
 * staleness story: a marker from a session that died cannot be found, because the next run removed the
 * directory before this one was written. `recordIsStale` and a pid exist for markers that outlive their
 * writer (the pack dev server's), and this one cannot.
 *
 * Written temp-then-rename at mode 0600, the convention the API uses for its own port and token files
 * (`publishApiFiles`): a reader never finds a half-written file, and an existing file's permissions are
 * not inherited. That helper is not exported, and `@abuddy/testing` sits under the API and cannot import
 * it, so the eight lines are here instead of shared.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EngineAddress } from './server.ts';

/** The file an agent reads to find the session. Beside the app's log, which is the other half it wants */
export const MARKER_FILE = 'engine.json';

export interface EngineMarker extends EngineAddress {
  /** So a reader can tell which session it found, and a person can kill it */
  readonly pid: number;
  /** The host, stated rather than assumed, since a reader builds a URL from this file alone */
  readonly host: string;
}

export function publishEngineMarker(outputDir: string, marker: EngineMarker): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, MARKER_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  // `wx` so this never writes through a file something else is holding, and 0600 because the token is in it
  fs.writeFileSync(temp, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  return file;
}

/** Removed on the way out, so the file's presence means a session is up */
export function removeEngineMarker(outputDir: string): void {
  try {
    fs.rmSync(path.join(outputDir, MARKER_FILE), { force: true });
  } catch {
    // A marker left behind is a stale address in a directory the next run deletes, which is not worth
    // failing a session's teardown over
  }
}

/**
 * What to print so the session is usable without reading the source.
 *
 * The engine's whole point is being driven from a shell, and an agent that has to work out the header
 * name and the body shape from a file path will write the wrong request first. One copyable line.
 */
export const engineRecipe = (file: string, marker: EngineMarker, tokenHeader: string): string => {
  const where = path.relative(process.cwd(), file).split(path.sep).join('/');
  // The token is read from the marker rather than printed: this goes to a terminal and into whatever
  // captures it, and the line is just as copyable with the substitution in it
  const auth = `-H "${tokenHeader}: $(node -p "require('./${where}').token")"`;
  return [
    `drive engine listening on http://${marker.host}:${marker.port} — ${where}`,
    `  curl -s http://${marker.host}:${marker.port}/state ${auth}`,
    `  curl -s http://${marker.host}:${marker.port}/qx ${auth} -d '{"code":"return qx(EARS.Entity.Note).count()"}'`,
    '  POST /eval /send /system /qx /tx /navigate /screenshot /close   GET /state /events /drops /errors',
  ].join('\n');
};
