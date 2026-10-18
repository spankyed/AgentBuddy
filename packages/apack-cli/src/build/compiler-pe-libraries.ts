export type PeImportedSymbol = { name: string } | { ordinal: number } | { boundAddress: bigint };

export interface PeLibraryMetadata {
  readonly machine: number;
  readonly imageBase: bigint;
  readonly timeStamp: number;
  readonly imports: readonly {
    name: string; delayed: boolean; timeStamp: number; symbols: readonly PeImportedSymbol[];
  }[];
  readonly exports: readonly {
    ordinal: number; names: readonly string[]; address: number; forwarder?: string;
  }[];
  readonly manifests: readonly { path: readonly (string | number)[]; bytes: Buffer }[];
}

function readPeHeaders(bytes: Buffer) {
  const invalid = () => new Error('Invalid PE native library metadata');
  const range = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0
      || offset > bytes.length || size > bytes.length - offset) throw invalid();
  };
  range(0, 64);
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw invalid();
  const pe = bytes.readUInt32LE(60);
  range(pe, 24);
  if (pe < 64 || bytes.readUInt32LE(pe) !== 0x4550) throw invalid();
  const optional = pe + 24, optionalSize = bytes.readUInt16LE(pe + 20);
  range(optional, optionalSize);
  if (optionalSize < 2) throw invalid();
  const magic = bytes.readUInt16LE(optional), wide = magic === 0x20b;
  const directoryStart = wide ? 112 : 96;
  if ((magic !== 0x10b && !wide) || optionalSize < directoryStart) throw invalid();
  const imageBase = wide ? bytes.readBigUInt64LE(optional + 24) : BigInt(bytes.readUInt32LE(optional + 28));
  const headerSize = bytes.readUInt32LE(optional + 60), imageSize = bytes.readUInt32LE(optional + 56);
  const directoryCount = bytes.readUInt32LE(optional + directoryStart - 4);
  if (directoryCount > (optionalSize - directoryStart) / 8 || headerSize > imageSize) throw invalid();
  range(0, headerSize);
  const sectionCount = bytes.readUInt16LE(pe + 6), start = optional + optionalSize;
  range(start, sectionCount * 40);
  if (start + sectionCount * 40 > headerSize) throw invalid();
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const at = start + i * 40;
    const size = bytes.readUInt32LE(at + 16), offset = bytes.readUInt32LE(at + 20);
    const address = bytes.readUInt32LE(at + 12), virtualSize = bytes.readUInt32LE(at + 8);
    range(offset, size);
    if (address + Math.max(size, virtualSize) > imageSize) throw invalid();
    return { name: bytes.subarray(at, at + 8).toString('ascii').split('\0')[0], address, offset, size };
  });
  const span = (address: number, size: number) => {
    if (!Number.isSafeInteger(address) || address < 0 || size < 0 || address + size > imageSize) throw invalid();
    const candidates = sections.filter(section => address >= section.address
      && address - section.address <= section.size && size <= section.size - (address - section.address));
    if (address < headerSize && size <= headerSize - address) candidates.push({ name: '', address: 0, offset: 0, size: headerSize });
    if (candidates.length !== 1) throw invalid();
    const section = candidates[0]!;
    return { offset: section.offset + address - section.address, end: section.offset + section.size };
  };
  const rva = (address: number, size: number) => span(address, size).offset;
  const string = (address: number, limit?: number) => {
    const { offset, end } = span(address, 1), zero = bytes.indexOf(0, offset);
    if (zero < 0 || zero >= end || (limit !== undefined && zero - offset >= limit)) throw invalid();
    const value = bytes.subarray(offset, zero);
    if (value.some(byte => byte > 127)) throw invalid();
    return value.toString('ascii');
  };
  const directory = (index: number) => {
    if (index >= directoryCount) return;
    const at = optional + directoryStart + index * 8;
    const address = bytes.readUInt32LE(at), size = bytes.readUInt32LE(at + 4);
    if (!address && !size) return;
    if (!address || !size) throw invalid();
    rva(address, size);
    return { address, size };
  };
  return { invalid, range, rva, string, directory, sections, imageBase, imageSize, wide,
    machine: bytes.readUInt16LE(pe + 4), timeStamp: bytes.readUInt32LE(pe + 8) };
}

/** Read an OS metadata section using the same checked PE header/RVA interpretation. */
export function readPeSection(bytes: Buffer, name: string): Buffer | undefined {
  const headers = readPeHeaders(bytes);
  const matches = headers.sections.filter(section => section.name === name);
  if (matches.length > 1) throw headers.invalid();
  const section = matches[0];
  return section && bytes.subarray(section.offset, section.offset + section.size);
}

/** File-backed loader declarations only: never load an image or resolve executable bindings. */
export function parsePeLibraryMetadata(bytes: Buffer): PeLibraryMetadata {
  const { invalid, rva, string, directory, imageBase, imageSize, wide, machine, timeStamp } = readPeHeaders(bytes);
  const imports: PeLibraryMetadata['imports'][number][] = [];
  const exports: PeLibraryMetadata['exports'][number][] = [];
  const manifests: PeLibraryMetadata['manifests'][number][] = [];
  const pointer = (address: number) => wide ? bytes.readBigUInt64LE(rva(address, 8)) : BigInt(bytes.readUInt32LE(rva(address, 4)));
  const address = (value: bigint) => {
    if (value < 0n || value > 0xffffffffn) throw invalid();
    return Number(value);
  };
  for (const delayed of [false, true]) {
    const table = directory(delayed ? 13 : 1);
    if (!table) continue;
    const stride = delayed ? 32 : 20;
    let terminated = false;
    for (let cursor = table.address; cursor + stride <= table.address + table.size; cursor += stride) {
      const at = rva(cursor, stride);
      if (bytes.subarray(at, at + stride).every(byte => byte === 0)) { terminated = true; break; }
      const relative = !delayed || (bytes.readUInt32LE(at) & 1) !== 0;
      const toRva = (value: number) => relative ? value : address(BigInt(value) - imageBase);
      const name = toRva(bytes.readUInt32LE(at + (delayed ? 4 : 12)));
      const names = bytes.readUInt32LE(at + (delayed ? 16 : 0));
      const values = bytes.readUInt32LE(at + (delayed ? 12 : 16));
      const stamp = bytes.readUInt32LE(at + (delayed ? 28 : 4));
      if (!name) throw invalid();
      const symbols: PeImportedSymbol[] = [];
      if (names || values) {
        const start = toRva(names || values), bound = !delayed && !names && stamp !== 0;
        const ordinalFlag = wide ? 1n << 63n : 1n << 31n;
        for (let cursor = start; ; cursor += wide ? 8 : 4) {
          const value = pointer(cursor);
          if (value === 0n) break;
          if (bound) symbols.push({ boundAddress: value });
          else if (value & ordinalFlag) symbols.push({ ordinal: Number(value & 0xffffn) });
          else symbols.push({ name: string(toRva(address(value)) + 2) });
        }
      }
      imports.push({ name: string(name), delayed, timeStamp: stamp, symbols });
    }
    if (!terminated) throw invalid();
  }
  const exported = directory(0);
  if (exported) {
    if (exported.size < 40) throw invalid();
    const at = rva(exported.address, 40), base = bytes.readUInt32LE(at + 16);
    const count = bytes.readUInt32LE(at + 20), named = bytes.readUInt32LE(at + 24);
    const functions = rva(bytes.readUInt32LE(at + 28), count * 4);
    const names = rva(bytes.readUInt32LE(at + 32), named * 4);
    const ordinals = rva(bytes.readUInt32LE(at + 36), named * 2);
    const aliases = new Map<number, string[]>();
    for (let i = 0; i < named; i++) {
      const ordinal = bytes.readUInt16LE(ordinals + i * 2);
      if (ordinal >= count) throw invalid();
      const values = aliases.get(ordinal) ?? [];
      values.push(string(bytes.readUInt32LE(names + i * 4)));
      aliases.set(ordinal, values);
    }
    for (let i = 0; i < count; i++) {
      const value = bytes.readUInt32LE(functions + i * 4);
      if (!value) continue;
      if (value >= imageSize) throw invalid();
      const forwarder = value >= exported.address && value < exported.address + exported.size
        ? string(value, exported.address + exported.size - value) : undefined;
      exports.push({ ordinal: base + i, names: aliases.get(i) ?? [], address: value, forwarder });
    }
  }
  const resources = directory(2);
  if (resources) {
    const active = new Set<number>();
    let budget = bytes.length;
    const resource = (offset: number, size: number) => {
      if (offset < 0 || offset + size > resources.size) throw invalid();
      return rva(resources.address + offset, size);
    };
    const walk = (offset: number, path: (number | string)[]) => {
      if (active.has(offset) || path.length >= 3) throw invalid();
      active.add(offset);
      const at = resource(offset, 16), count = bytes.readUInt16LE(at + 12) + bytes.readUInt16LE(at + 14);
      const entries = resource(offset + 16, count * 8);
      for (let i = 0; i < count; i++) {
        if (--budget < 0) throw invalid();
        const name = bytes.readUInt32LE(entries + i * 8), target = bytes.readUInt32LE(entries + i * 8 + 4);
        if (!path.length && name !== 24) continue;
        let label: number | string = name;
        if (name & 0x80000000) {
          const start = name & 0x7fffffff, length = bytes.readUInt16LE(resource(start, 2));
          const at = resource(start + 2, length * 2);
          label = bytes.toString('utf16le', at, at + length * 2);
        }
        const next = [...path, label];
        if (target & 0x80000000) walk(target & 0x7fffffff, next);
        else {
          const entry = resource(target, 16), size = bytes.readUInt32LE(entry + 4);
          const start = rva(bytes.readUInt32LE(entry), size);
          manifests.push({ path: next, bytes: bytes.subarray(start, start + size) });
        }
      }
      active.delete(offset);
    };
    walk(0, []);
  }
  return { machine, imageBase, timeStamp, imports, exports, manifests };
}
