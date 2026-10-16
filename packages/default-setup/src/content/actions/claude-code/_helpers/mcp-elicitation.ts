/** Keep explicit HTTP(S) navigation free of credentials and parser-ambiguous controls. */
export function mcpElicitationUrl(value: unknown): string | undefined {
  // eslint-disable-next-line no-control-regex -- Intentionally reject control characters before navigation.
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f\\]/.test(value)) return undefined;
  return /^https?:\/\/[^\s\\/@?#]+(?:[/?#][^\s\\]*)?$/i.test(value) ? value : undefined;
}
