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
          standard: true,
          secure: true,
          supportFetchAPI: true,
          bypassCSP: true,
          // Note: stream must NOT be set here. stream:true tells Chromium's
          // MultibufferDataSource to treat the source as non-seekable streaming
          // content, which breaks video seeking (video.seekable is empty).
          // See Electron bug #38749 and PR #22955.
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

      // Serve local files to the renderer (used for video playback in editor tabs).
      // Uses registerFileProtocol (deprecated but functional) because it serves
      // buffered file responses, which pair with the stream-free scheme privileges
      // above to enable video seeking. protocol.handle returns streaming Responses
      // that require stream:true — the flag that breaks seeking (Electron #38749).
      protocol.registerFileProtocol('local-file', (request, callback) => {
        const url = new URL(request.url);
        const filePath = url.searchParams.get('path');

        if (!filePath || !existsSync(filePath)) {
          callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
          return;
        }

        callback(filePath);
      });
    });
  }
}

export function createMediaProtocol() {
  return new MediaProtocol();
}
