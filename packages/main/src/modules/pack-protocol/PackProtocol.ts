import { app, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppModule } from '../../AppModule.ts';
import type { ModuleContext } from '../../ModuleContext.ts';
import { getAppContext, shippedPacksDir } from '../../app-context.ts';
import { devServerUrl } from '@abuddy/host/packs/dev-server';

/** A pack id, as the manifest schema defines it (`abuddy-sdk/src/build/manifest-schema.ts`) */
const PACK_ID = /^[a-z][a-z0-9-]*$/;

/**
 * What a `pack://` request addresses, or `null` when no pack does.
 *
 * **The pack id comes from the URL's host, and what the parser makes of that host is the thing being
 * checked.** `pack://../x` parses to the host `..`, which would resolve the pack dir to its parent — the
 * data dir — and pass the prefix check in `resolvePackFile`, serving any file sitting directly in it. A
 * pack id is a single plain segment, so anything else is refused before it reaches the filesystem.
 *
 * Exported, and separate from the handler, for the reason `resolvePackFile` is: a refusal that lives inside
 * `protocol.handle` can only be asserted by starting Electron, so it was asserted nowhere. Its subject is
 * input, which means it needs a case that fires — and the parse it depends on is not this repo's, so the
 * case is also what shows the parse changing under a scheme privilege or a Chromium bump.
 */
export function packRequestTarget(requestUrl: string): { packId: string; filePath: string } | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (!PACK_ID.test(url.hostname)) return null;
  return { packId: url.hostname, filePath: decodeURIComponent(url.pathname) };
}

/** What the pack:// handler serves each extension as. Exported so its spec asserts this map, not a copy. */
/**
 * The file a `pack://` request serves, or `null`.
 *
 * **Two roots, because a pack is either installed in the user's data dir or shipped with the app**, and a
 * pack's frontend is fetched the same way whichever it is. A shipped pack is served out of its `dist/`,
 * which is where its own `abuddy build` wrote the bundle an installed pack carries at its root. The
 * installed copy comes first, so a pack the user replaced serves its own files.
 *
 * Each candidate is checked against *its own* prefix, so neither root widens what the other serves, and
 * anything resolving outside both — a `..` in the path — matches nothing and is a 404 rather than a read.
 * `packId` is already known to be a single plain segment (`PACK_ID`), which is what keeps a root from being
 * moved by the request: it is part of every prefix this compares against.
 */
export function resolvePackFile(
  { packsDir, shippedDir, packId, filePath }: { packsDir: string; shippedDir: string; packId: string; filePath: string },
): string | null {
  const roots = [path.join(packsDir, packId), path.join(shippedDir, packId, 'dist')];
  const relative = filePath.replace(/^\//, '');
  return roots
    .map((root) => ({ root, file: path.resolve(root, relative) }))
    .find(({ root, file }) => file.startsWith(root + path.sep) && fs.existsSync(file))
    ?.file ?? null;
}

export const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};


class PackProtocol implements AppModule {
  enable(_ctx: ModuleContext): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'pack',
        privileges: {
          // A standard scheme, so a module served from `pack://` resolves like one served over http: relative
          // specifiers against the module's own URL, and bare ones through the document's import map. Without
          // it a pack bundle that emits more than one chunk cannot reliably load its own siblings, and nothing
          // external can be shared by resolution rather than through a global.
          //
          // It changes how the *renderer* parses `pack://` — a standard scheme lowercases the host and
          // normalises the path — so what the pack-id guard receives is not what it received before.
          // `packRequestTarget`'s cases cannot see that: they run under Node's parser. The pack E2E suites
          // are the ones that do. `local-file` in `../media-protocol/MediaProtocol.ts` already ships this
          // combination.
          standard: true,
          secure: true,
          supportFetchAPI: true,
        },
      },
    ]);

    app.whenReady().then(() => {
      protocol.handle('pack', async (request) => {
        const target = packRequestTarget(request.url);
        if (!target) return new Response('Forbidden', { status: 403 });
        const { packId, filePath } = target;

        const {packsDir, userDataDir} = getAppContext();

        let devUrl: string | null;
        try {
          devUrl = devServerUrl(userDataDir, packId, filePath);
        } catch (err) {
          return new Response((err as Error).message, { status: 502 });
        }
        if (devUrl) {
          try {
            const res = await fetch(devUrl);
            if (res.ok) {
              const body = await res.arrayBuffer();
              const headers: Record<string, string> = {};
              const ct = res.headers.get('content-type');
              if (ct) headers['Content-Type'] = ct;
              return new Response(body, { headers });
            }
          } catch {}
        }

        const resolved = resolvePackFile({ packsDir, shippedDir: shippedPacksDir(), packId, filePath });
        if (!resolved) {
          // A traversal lands here too: it is outside every prefix, so no candidate matched
          return new Response('Not Found', { status: 404 });
        }

        const ext = path.extname(resolved);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        return new Response(fs.readFileSync(resolved), {
          headers: { 'Content-Type': contentType },
        });
      });
    });
  }
}

export function createPackProtocol() {
  return new PackProtocol();
}
