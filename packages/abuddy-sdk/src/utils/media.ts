import * as fs from 'fs'
import * as path from 'path'
import { getMediaPath, ensureDirectoryExists } from './paths'

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
      filename: match[4].split('?')[0],
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

/** Rewrite media:// URLs to flat relative paths using a filename map. */
export function rewriteMediaUrls(
  markdown: string,
  mediaFilenameMap: Map<string, string>,
): string {
  return markdown.replace(
    /media:\/\/([^/]+)\/([^)\s]+)/g,
    (_match, entityId, filename) => {
      const qIdx = filename.indexOf('?')
      const cleanFilename = qIdx >= 0 ? filename.substring(0, qIdx) : filename
      const queryString = qIdx >= 0 ? filename.substring(qIdx) : ''
      const key = `${entityId}/${cleanFilename}`
      const mapped = mediaFilenameMap.get(key) || cleanFilename
      return `media/${mapped}${queryString}`
    },
  )
}

/** Remove ![](media://...) image syntax from markdown, returning clean text. */
export function stripMediaRefs(markdown: string): string {
  return markdown.replace(MEDIA_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------------------
// Export / Import media helpers
// ---------------------------------------------------------------------------

/** Copy media files to outputDir/media/{entityId}/{filename}. Returns files copied. */
export function copyMediaByRef(refs: MediaRef[], outputDir: string): number {
  let copied = 0
  for (const ref of refs) {
    const resolved = resolveMedia(ref)
    if (!resolved) continue
    const destDir = path.join(outputDir, 'media', ref.entityId)
    ensureDirectoryExists(destDir)
    fs.copyFileSync(resolved.filePath, path.join(destDir, ref.filename))
    copied++
  }
  return copied
}

/** Copy media to flat outputDir/media/{flatName} using a ref-key→filename map. Returns files copied. */
export function copyFlatMedia(mediaFilenameMap: Map<string, string>, outputDir: string): number {
  let copied = 0
  const mediaDir = path.join(outputDir, 'media')
  for (const [refKey, flatName] of mediaFilenameMap) {
    const [entityId, filename] = refKey.split('/')
    const resolved = resolveMedia({ alt: '', originalUrl: '', entityId, filename })
    if (!resolved) continue
    ensureDirectoryExists(mediaDir)
    fs.copyFileSync(resolved.filePath, path.join(mediaDir, flatName))
    copied++
  }
  return copied
}

/** Restore media from JSON export: copy files and rewrite entity IDs. */
export function restoreJsonMediaRefs(
  content: string,
  newEntityId: string,
  importDir: string,
): { content: string; mediaRestored: number } {
  const refs = extractMediaRefs(content)
  if (refs.length === 0) return { content, mediaRestored: 0 }

  let rewritten = content
  let mediaRestored = 0
  for (const ref of refs) {
    const srcFile = path.join(importDir, 'media', ref.entityId, ref.filename)
    if (!fs.existsSync(srcFile)) continue
    const destDir = path.join(getMediaPath(), newEntityId)
    ensureDirectoryExists(destDir)
    fs.copyFileSync(srcFile, path.join(destDir, ref.filename))
    mediaRestored++
    rewritten = rewritten.split(`media://${ref.entityId}/`).join(`media://${newEntityId}/`)
  }
  return { content: rewritten, mediaRestored }
}

/** Restore media from Markdown export: copy flat files and rewrite to media:// URLs. */
export function restoreMarkdownMediaRefs(
  content: string,
  newEntityId: string,
  rootImportDir: string,
): { content: string; mediaRestored: number } {
  const mediaRefPattern = /media\/([^)\s]+)/g
  let match: RegExpExecArray | null
  const processedFiles = new Set<string>()
  let rewritten = content
  let mediaRestored = 0

  while ((match = mediaRefPattern.exec(content)) !== null) {
    const rawFilename = match[1]
    const cleanFilename = rawFilename.split('?')[0]
    if (processedFiles.has(cleanFilename)) continue
    processedFiles.add(cleanFilename)
    const srcFile = path.join(rootImportDir, 'media', cleanFilename)
    if (!fs.existsSync(srcFile)) continue
    const destDir = path.join(getMediaPath(), newEntityId)
    ensureDirectoryExists(destDir)
    fs.copyFileSync(srcFile, path.join(destDir, cleanFilename))
    mediaRestored++
    rewritten = rewritten.split(`media/${rawFilename}`).join(`media://${newEntityId}/${rawFilename}`)
  }
  return { content: rewritten, mediaRestored }
}
