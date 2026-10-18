export interface ElfLibraryCommands {
  readonly machine: number;
  readonly dependencies: string[];
  readonly rpath?: string;
  readonly runpath?: string;
  readonly flags1: number;
  readonly auxiliary: string[];
  readonly filters: string[];
  readonly audit?: string;
  readonly dependencyAudit?: string;
}

/** Read file-backed dynamic metadata, including stripped images; never load or execute the image. */
export function parseElfLibraryCommands(bytes: Buffer): ElfLibraryCommands {
  const invalid = () => new Error('Invalid ELF native library commands');
  const range = (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
      || offset > bytes.length || length > bytes.length - offset) throw invalid();
  };
  range(0, 16);
  if (bytes.toString('hex', 0, 4) !== '7f454c46' || ![1, 2].includes(bytes[4])
    || ![1, 2].includes(bytes[5]) || bytes[6] !== 1) throw invalid();
  const wide = bytes[4] === 2, little = bytes[5] === 1;
  const uint16 = (offset: number) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const uint32 = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  const word = (offset: number) => {
    const value = wide ? Number(little ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset)) : uint32(offset);
    if (!Number.isSafeInteger(value)) throw invalid();
    return value;
  };
  const headerSize = wide ? 64 : 52, programSize = wide ? 56 : 32;
  range(0, headerSize);
  if (![2, 3].includes(uint16(16)) || uint32(20) !== 1
    || uint16(wide ? 52 : 40) !== headerSize) throw invalid();
  const start = word(wide ? 32 : 28), size = uint16(wide ? 54 : 42);
  let count = uint16(wide ? 56 : 44);
  if (count === 0xffff) {
    const section = word(wide ? 40 : 32), sectionSize = wide ? 64 : 40;
    if (section < headerSize || uint16(wide ? 58 : 46) < sectionSize) throw invalid();
    range(section, sectionSize);
    count = uint32(section + (wide ? 44 : 28));
  }
  if (size < programSize || start < headerSize) throw invalid();
  range(start, size * count);
  const loads: { offset: number; address: number; size: number }[] = [];
  let dynamic: { offset: number; size: number } | undefined;
  for (let i = 0; i < count; i++) {
    const at = start + i * size, type = uint32(at);
    if (type !== 1 && type !== 2) continue;
    const offset = word(at + (wide ? 8 : 4)), address = word(at + (wide ? 16 : 8));
    const fileSize = word(at + (wide ? 32 : 16)), memorySize = word(at + (wide ? 40 : 20));
    range(offset, fileSize);
    if (fileSize > memorySize) throw invalid();
    if (type === 1) loads.push({ offset, address, size: fileSize });
    else {
      if (dynamic) throw invalid();
      dynamic = { offset, size: fileSize };
    }
  }
  if (!dynamic) throw new Error('ELF native library has no dynamic segment');
  const entrySize = wide ? 16 : 8;
  if (!dynamic.size || dynamic.size % entrySize !== 0) throw invalid();
  const entries = new Map<number, number[]>();
  let terminated = false;
  for (let at = dynamic.offset; at < dynamic.offset + dynamic.size; at += entrySize) {
    const tag = wide ? Number(little ? bytes.readBigInt64LE(at) : bytes.readBigInt64BE(at))
      : little ? bytes.readInt32LE(at) : bytes.readInt32BE(at);
    if (tag === 0) { terminated = true; break; }
    // Ignore unrelated values, whose pointers or signed encodings need not fit a JS number.
    if (![1, 5, 10, 15, 29, 0x6ffffffb, 0x6ffffefb, 0x6ffffefc, 0x7ffffffd, 0x7fffffff].includes(tag)) continue;
    const values = entries.get(tag) ?? [];
    values.push(word(at + entrySize / 2));
    entries.set(tag, values);
  }
  if (!terminated) throw invalid();
  const single = (tag: number) => {
    const values = entries.get(tag);
    if (values && values.length !== 1) throw invalid();
    return values?.[0];
  };
  const address = single(5), stringSize = single(10);
  if (address === undefined || stringSize === undefined || stringSize === 0) throw invalid();
  const load = loads.find(load => address >= load.address && address - load.address <= load.size
    && stringSize <= load.size - (address - load.address));
  if (!load) throw invalid();
  const strings = load.offset + address - load.address;
  range(strings, stringSize);
  const string = (offset: number) => {
    if (offset >= stringSize) throw invalid();
    const zero = bytes.indexOf(0, strings + offset);
    if (zero < 0 || zero >= strings + stringSize) throw invalid();
    return bytes.toString('utf8', strings + offset, zero);
  };
  const optionalString = (tag: number) => {
    const offset = single(tag);
    return offset === undefined ? undefined : string(offset);
  };
  return {
    machine: uint16(18), dependencies: (entries.get(1) ?? []).map(string),
    rpath: optionalString(15), runpath: optionalString(29), flags1: single(0x6ffffffb) ?? 0,
    auxiliary: (entries.get(0x7ffffffd) ?? []).map(string), filters: (entries.get(0x7fffffff) ?? []).map(string),
    audit: optionalString(0x6ffffefc), dependencyAudit: optionalString(0x6ffffefb),
  };
}
