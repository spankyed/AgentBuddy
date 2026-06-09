import type { AppModule } from '../../AppModule.js';
import type { ModuleContext } from '../../ModuleContext.js';
import { protocol, net } from 'electron';
import { resolveMediaFilePath } from './paths.js';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

class MediaProtocol implements AppModule {
  enable({ app }: ModuleContext): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'media',
        privileges: {
          secure: true,
          supportFetchAPI: true,
          bypassCSP: true,
          stream: true,
        },
      },
      {
        scheme: 'local-file',
        privileges: {
          secure: true,
          supportFetchAPI: true,
          bypassCSP: true,
          stream: true,
        },
      },
    ]);

    app.whenReady().then(() => {
      protocol.handle('media', (request) => {
        const url = new URL(request.url);
        const entityId = url.hostname;
        const filename = decodeURIComponent(url.pathname.slice(1)); // strip leading /

        if (!entityId || !filename || entityId.includes('..') || filename.includes('..')) {
          return new Response('Not found', { status: 404 });
        }

        const filePath = resolveMediaFilePath(entityId, filename);

        if (!existsSync(filePath)) {
          return new Response('Not found', { status: 404 });
        }

        return net.fetch(pathToFileURL(filePath).toString());
      });

      // Serve local files to the renderer (used for video playback in editor tabs)
      protocol.handle('local-file', (request) => {
        const url = new URL(request.url);
        const filePath = url.searchParams.get('path');

        if (!filePath || !existsSync(filePath)) {
          return new Response('Not found', { status: 404 });
        }

        return net.fetch(pathToFileURL(filePath).toString());
      });
    });
  }
}

export function createMediaProtocol() {
  return new MediaProtocol();
}
