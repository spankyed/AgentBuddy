export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const idx = v.indexOf('-');
    const core = (idx === -1 ? v : v.slice(0, idx)).split('.').map(Number);
    const pre = idx === -1 ? null : v.slice(idx + 1);
    return { core, pre };
  };
  const av = parse(a), bv = parse(b);

  for (let i = 0; i < Math.max(av.core.length, bv.core.length); i++) {
    const diff = (av.core[i] ?? 0) - (bv.core[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (av.pre !== null && bv.pre === null) return -1;
  if (av.pre === null && bv.pre !== null) return 1;
  if (av.pre === null && bv.pre === null) return 0;

  const aParts = av.pre!.split('.');
  const bParts = bv.pre!.split('.');
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    if (aParts[i] === undefined) return -1;
    if (bParts[i] === undefined) return 1;
    const aNum = Number(aParts[i]), bNum = Number(bParts[i]);
    const aIsNum = !isNaN(aNum), bIsNum = !isNaN(bNum);
    if (aIsNum && bIsNum) { if (aNum !== bNum) return aNum - bNum; }
    else if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;
    else { if (aParts[i] < bParts[i]) return -1; if (aParts[i] > bParts[i]) return 1; }
  }
  return 0;
}
