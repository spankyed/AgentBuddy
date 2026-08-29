import { app, net, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppModule } from '../../AppModule.js';
import type { ModuleContext } from '../../ModuleContext.js';

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

function getPacksDir(): string {
  return path.join(app.getPath('userData'), 'packs');
}

class PackProtocol implements AppModule {
  enable(_ctx: ModuleContext): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'pack',
        privileges: {
          secure: true,
          supportFetchAPI: true,
          bypassCSP: true,
        },
      },
    ]);

    app.whenReady().then(() => {
      protocol.handle('pack', (request) => {
        const url = new URL(request.url);
        const packId = url.hostname;
        const filePath = decodeURIComponent(url.pathname);

        const packsDir = getPacksDir();
        const resolved = path.resolve(packsDir, packId, filePath.replace(/^\//, ''));

        if (!resolved.startsWith(path.join(packsDir, packId))) {
          return new Response('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(resolved)) {
          return new Response('Not Found', { status: 404 });
        }

        const ext = path.extname(resolved);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        return net.fetch(`file://${resolved}`, {
          headers: { 'Content-Type': contentType },
        });
      });
    });
  }
}

export function createPackProtocol() {
  return new PackProtocol();
}
