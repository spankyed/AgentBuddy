import { extractMediaRefs, resolveMedia, readMediaBuffer, extractAndResolveImages, stripMediaRefs } from '@/core/shared/media'

export { extractMediaRefs, resolveMedia, readMediaBuffer, extractAndResolveImages, stripMediaRefs }

export interface ImagePart {
  type: 'image'
  image: Buffer
  mimeType: string
}

/** Extract all media refs from markdown and read them into AI SDK image parts. */
export function extractImageParts(markdown: string): ImagePart[] {
  return extractMediaRefs(markdown)
    .map(ref => readMediaBuffer(ref))
    .filter((img): img is NonNullable<typeof img> => img !== null)
    .map(img => ({
      type: 'image' as const,
      image: img.data,
      mimeType: img.mimeType,
    }))
}
