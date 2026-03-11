import * as fs from 'fs'
import * as path from 'path'
import { getMediaPath } from './paths'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaRef {
  entityId: string
  filename: string
  alt: string
  originalUrl: string
}

export interface ResolvedMedia extends MediaRef {
  filePath: string
  mimeType: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEDIA_RE = /!\[([^\]]*)\]\((media:\/\/([^/]+)\/([^)]+))\)/g

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract all media:// references from a markdown string. */
export function extractMediaRefs(markdown: string): MediaRef[] {
  const refs: MediaRef[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(MEDIA_RE.source, MEDIA_RE.flags)
  while ((match = re.exec(markdown)) !== null) {
    refs.push({
      alt: match[1],
      originalUrl: match[2],
      entityId: match[3],
      filename: match[4],
    })
  }
  return refs
}

/** Resolve a MediaRef to an absolute file path with mime type. Returns null if file doesn't exist. */
export function resolveMedia(ref: MediaRef): ResolvedMedia | null {
  const filePath = path.join(getMediaPath(), ref.entityId, ref.filename)
  if (!fs.existsSync(filePath)) return null
  return {
    ...ref,
    filePath,
    mimeType: getMimeType(ref.filename),
  }
}

/** Read a media file into a Buffer. Returns null if the file doesn't exist. */
export function readMediaBuffer(ref: MediaRef): { data: Buffer; mimeType: string } | null {
  const resolved = resolveMedia(ref)
  if (!resolved) return null
  return {
    data: fs.readFileSync(resolved.filePath),
    mimeType: resolved.mimeType,
  }
}

/** Extract media refs from markdown and resolve to file paths, filtering out missing files. */
export function extractAndResolveImages(markdown: string): ResolvedMedia[] {
  return extractMediaRefs(markdown)
    .map(ref => resolveMedia(ref))
    .filter((img): img is ResolvedMedia => img !== null)
}

/** Remove ![](media://...) image syntax from markdown, returning clean text. */
export function stripMediaRefs(markdown: string): string {
  return markdown.replace(MEDIA_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}
