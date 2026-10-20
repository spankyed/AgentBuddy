/** Own data independently of caller mutation; executable values are captured separately. */
export function captureData<T>(data: T): T {
  const copy = structuredClone(data);
  const seen = new Set<object>();
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  freeze(copy);
  return copy;
}
