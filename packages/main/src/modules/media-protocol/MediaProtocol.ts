import type { AppModule } from '../../AppModule.js';
import type { ModuleContext } from '../../ModuleContext.js';
import { protocol, net } from 'electron';
import { resolveMediaFilePath } from './paths.js';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
};

function getContentType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function parseRange(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return null;

  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number(startValue);
  const end = endValue ? Number(endValue) : fileSize - 1;

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || end < start || start >= fileSize) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}

function createStreamBody(
  filePath: string,
  request: Request,
  range?: { start: number; end: number },
): BodyInit {
  const nodeStream = createReadStream(filePath, range);
  // Chromium aborts the prior range request on every seek — destroy the read
  // stream so we don't leak file descriptors.
  request.signal.addEventListener('abort', () => nodeStream.destroy(), { once: true });
  return Readable.toWeb(nodeStream) as unknown as BodyInit;
}

function streamFileResponse(filePath: string, request: Request): Response {
  const fileSize = statSync(filePath).size;
  const contentType = getContentType(filePath);
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    const contentLength = range.end - range.start + 1;
    return new Response(createStreamBody(filePath, request, range), {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(contentLength),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
        'Content-Type': contentType,
      },
    });
  }

  return new Response(createStreamBody(filePath, request), {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
    },
  });
}

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

        return streamFileResponse(filePath, request);
      });
    });
  }
}

export function createMediaProtocol() {
  return new MediaProtocol();
}
