import { app, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppModule } from '../../AppModule.js';
import type { ModuleContext } from '../../ModuleContext.js';
import { getAppContext } from '../../app-context.js';
import { devServerUrl } from '@abuddy/host/packs/dev-server';

/** A pack id, as the manifest schema defines it (`abuddy-sdk/src/build/manifest-schema.ts`) */
const PACK_ID = /^[a-z][a-z0-9-]*$/;

const MIME_TYPES: Record<string, string> = {
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

        const resolved = path.resolve(packsDir, packId, filePath.replace(/^\//, ''));

        const allowedPrefix = path.join(packsDir, packId) + path.sep;
        if (!resolved.startsWith(allowedPrefix)) {
          return new Response('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(resolved)) {
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
