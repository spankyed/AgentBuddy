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
