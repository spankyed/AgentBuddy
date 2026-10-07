import { app, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppModule } from '../../AppModule.ts';
import type { ModuleContext } from '../../ModuleContext.ts';
import { getAppContext, shippedPacksDir } from '../../app-context.ts';
import { devServerUrl } from '@abuddy/host/packs/dev-server';

/** A pack id, as the manifest schema defines it (`abuddy-sdk/src/build/manifest-schema.ts`) */
const PACK_ID = /^[a-z][a-z0-9-]*$/;

/** What the pack:// handler serves each extension as. Exported so its spec asserts this map, not a copy. */
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
          secure: true,
          supportFetchAPI: true,
        },
      },
    ]);

    app.whenReady().then(() => {
      protocol.handle('pack', async (request) => {
        const url = new URL(request.url);
        const packId = url.hostname;
        const filePath = decodeURIComponent(url.pathname);

        // `pack://../x` parses to the host "..", which would resolve the pack dir to its parent — the data
        // dir — and pass the prefix check below, serving any file sitting directly in it. A pack id is a
        // single plain path segment, so anything else is refused before it reaches the filesystem.
        if (!PACK_ID.test(packId)) {
          return new Response('Forbidden', { status: 403 });
        }

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

        // Two roots, because a pack is either installed in the user's data dir or shipped with the app, and
        // a pack's frontend is fetched the same way whichever it is. A shipped pack is served out of its
        // `dist/`, which is where its own `abuddy build` wrote the bundle an installed pack carries at its
        // root. Each candidate is checked against its own prefix, so neither widens what the other serves.
        const roots = [path.join(packsDir, packId), path.join(shippedPacksDir(), packId, 'dist')];
        const relative = filePath.replace(/^\//, '');
        const resolved = roots
          .map((root) => ({ root, file: path.resolve(root, relative) }))
          .find(({ root, file }) => file.startsWith(root + path.sep) && fs.existsSync(file))
          ?.file;

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
