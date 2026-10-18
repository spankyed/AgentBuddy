export function peImage(wide = true) {
  const bytes = Buffer.alloc(0x1c00), optional = 0x98, directories = optional + (wide ? 112 : 96);
  const section = optional + (wide ? 240 : 224), imageBase = wide ? 0x180000000n : 0x400000n;
  bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(0x80, 60); bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(wide ? 0x8664 : 0x14c, 0x84); bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt32LE(1234, 0x88); bytes.writeUInt16LE(wide ? 240 : 224, 0x94);
  bytes.writeUInt16LE(wide ? 0x20b : 0x10b, optional);
  if (wide) bytes.writeBigUInt64LE(imageBase, optional + 24); else bytes.writeUInt32LE(Number(imageBase), optional + 28);
  bytes.writeUInt32LE(0x3000, optional + 56); bytes.writeUInt32LE(0x400, optional + 60);
  bytes.writeUInt32LE(16, directories - 4);
  bytes.write('.rdata', section); bytes.writeUInt32LE(0x2000, section + 8); bytes.writeUInt32LE(0x1000, section + 12);
  bytes.writeUInt32LE(0x1800, section + 16); bytes.writeUInt32LE(0x400, section + 20);
  const offset = (rva: number) => rva - 0x1000 + 0x400;
  const uint = (rva: number, value: number) => bytes.writeUInt32LE(value, offset(rva));
  const text = (rva: number, value: string) => bytes.write(value + '\0', offset(rva));
  const pointer = (rva: number, value: bigint) => wide ? bytes.writeBigUInt64LE(value, offset(rva)) : uint(rva, Number(value));
  const directory = (index: number, address: number, size: number) => {
    bytes.writeUInt32LE(address, directories + index * 8); bytes.writeUInt32LE(size, directories + index * 8 + 4);
  };
  const imports = () => {
    directory(1, 0x1000, 40); uint(0x1000, 0x1100); uint(0x100c, 0x1200); uint(0x1010, 0x1300);
    text(0x1200, 'value.dll'); pointer(0x1100, 0x1400n);
    pointer(0x1100 + (wide ? 8 : 4), (1n << (wide ? 63n : 31n)) | 7n);
    text(0x1402, 'native_value');
  };
  return { bytes, wide, optional, section, imageBase, offset, uint, text, pointer, directory, imports };
}
