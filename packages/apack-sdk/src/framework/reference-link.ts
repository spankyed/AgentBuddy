/** Stored reference identity is independent of declaration or runtime availability. */
export interface ReferenceTarget {
  readonly type: string;
  readonly id: string;
}

const PREFIX = 'apack-ref://';
const encode = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Encodes presentation type and canonical entity id separately; labels never determine identity. */
export function formatReferenceHref(target: ReferenceTarget): string {
  if (typeof target.type !== 'string' || !target.type || typeof target.id !== 'string' || !target.id) throw new Error('A reference requires a type and canonical entity id');
  return `${PREFIX}${encode(target.type)}/${encode(target.id)}`;
}

/** Parses only the internal reference format, without reading or activating a pack. */
export function parseReferenceHref(href: string): ReferenceTarget | undefined {
  if (!href.startsWith(PREFIX)) return undefined;
  const segments = href.slice(PREFIX.length).split('/');
  if (segments.length !== 2 || segments.some(segment => !segment || /[?#]/.test(segment))) return undefined;
  try {
    const [type, id] = segments.map(segment => decodeURIComponent(segment));
    return type && id ? { type, id } : undefined;
  } catch { return undefined; }
}
