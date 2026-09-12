import * as fs from 'node:fs';
import * as path from 'node:path';

export function toPascalCase(name: string): string {
  return name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
}

export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

export function toLabel(name: string): string {
  return name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function validateName(name: string, entity: string): void {
  if (!name) throw new Error(`${entity} name is required`);
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`${entity} name must be lowercase alphanumeric with hyphens (e.g. "my-${entity}")`);
  }
}

export function writeIfNotExists(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    console.warn(`  skip ${path.relative(process.cwd(), filePath)} (already exists)`);
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

export function logCreated(root: string, files: string[]): void {
  for (const f of files) {
    console.log(`  + ${path.relative(root, f)}`);
  }
}

export function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function updateRegisterArray(
  filePath: string,
  importLine: string,
  arrayEntry: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes(arrayEntry.trim().split('\n')[0])) return false;

  const lastImportIdx = content.lastIndexOf('\nimport ');
  if (lastImportIdx === -1) return false;
  if (importLine) {
    const endOfLastImport = content.indexOf('\n', lastImportIdx + 1);
    content = content.slice(0, endOfLastImport + 1) + importLine + '\n' + content.slice(endOfLastImport + 1);
  }

  const arrayCloseIdx = content.lastIndexOf('];');
  if (arrayCloseIdx === -1) return false;
  content = content.slice(0, arrayCloseIdx) + arrayEntry + content.slice(arrayCloseIdx);

  fs.writeFileSync(filePath, content);
  return true;
}

export function updateComponentMap(
  filePath: string,
  importLine: string,
  mapKey: string,
  mapValue: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes(`'${mapKey}'`) || content.includes(`"${mapKey}"`)) return false;

  const lastImportIdx = content.lastIndexOf('\nimport ');
  if (lastImportIdx === -1) return false;
  const endOfLastImport = content.indexOf('\n', lastImportIdx + 1);
  content = content.slice(0, endOfLastImport + 1) + importLine + '\n' + content.slice(endOfLastImport + 1);

  const mapCloseIdx = content.lastIndexOf('};');
  if (mapCloseIdx === -1) return false;
  content = content.slice(0, mapCloseIdx) + `  '${mapKey}': ${mapValue},\n` + content.slice(mapCloseIdx);

  fs.writeFileSync(filePath, content);
  return true;
}
