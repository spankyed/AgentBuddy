export interface PeApiSet {
  readonly name: string;
  readonly hashedName: string;
  readonly hosts: readonly { importer: string; library: string }[];
}

/** Windows 10+ API_SET_NAMESPACE v6, read from the OS image's .apiset section. */
export function parsePeApiSets(bytes: Buffer): readonly PeApiSet[] {
  const invalid = () => new Error('Invalid Windows API-set namespace');
  let size = bytes.length;
  const range = (at: number, length: number) => {
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(length) || at < 0 || length < 0
      || at > size || length > size - at) throw invalid();
  };
  range(0, 28);
  if (bytes.readUInt32LE(0) !== 6) throw new Error('Unsupported Windows API-set namespace version');
  size = bytes.readUInt32LE(4);
  if (size < 28 || size > bytes.length) throw invalid();
  const string = (at: number, length: number) => {
    range(at, length);
    if (length % 2) throw invalid();
    const value = bytes.toString('utf16le', at, at + length);
    if (value.includes('\0')) throw invalid();
    return value.toLowerCase();
  };
  const count = bytes.readUInt32LE(12), start = bytes.readUInt32LE(16);
  range(start, count * 24);
  const result: PeApiSet[] = [];
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    const at = start + i * 24, nameOffset = bytes.readUInt32LE(at + 4), nameLength = bytes.readUInt32LE(at + 8);
    const hashedLength = bytes.readUInt32LE(at + 12), values = bytes.readUInt32LE(at + 16), count = bytes.readUInt32LE(at + 20);
    if (!hashedLength || hashedLength > nameLength) throw invalid();
    const name = string(nameOffset, nameLength), hashedName = string(nameOffset, hashedLength);
    if (names.has(name)) throw invalid();
    names.add(name);
    range(values, count * 20);
    const hosts = Array.from({ length: count }, (_, index) => {
      const at = values + index * 20;
      return { importer: string(bytes.readUInt32LE(at + 4), bytes.readUInt32LE(at + 8)),
        library: string(bytes.readUInt32LE(at + 12), bytes.readUInt32LE(at + 16)) };
    });
    result.push({ name, hashedName, hosts });
  }
  return result;
}

/** The namespace hashes through the last hyphen; importer-specific hosts override the default. */
export function resolvePeApiSet(sets: readonly PeApiSet[], name: string, importer: string): string | undefined {
  const normalized = name.toLowerCase().replace(/\.dll$/, '');
  if (!/^(api|ext)-/.test(normalized)) return;
  const hashed = normalized.slice(0, normalized.lastIndexOf('-'));
  const entry = sets.find(entry => entry.hashedName === hashed);
  if (!entry) return;
  return (entry.hosts.slice(1).find(host => host.importer === importer.toLowerCase()) ?? entry.hosts[0])?.library ?? '';
}
