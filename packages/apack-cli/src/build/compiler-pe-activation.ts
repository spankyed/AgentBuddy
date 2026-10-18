import fs from 'node:fs';
import { win32 as path } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parsePeLibraryMetadata } from './compiler-pe-libraries.ts';
import { pePath } from './compiler-pe-paths.ts';
import { cliPackageDirectory } from './tool-identity.ts';

export interface CompilerPeActivationInput {
  readonly file: string;
  readonly kind: 'file' | 'directory' | 'missing';
  readonly hash: string | null;
}

export interface CompilerPeActivationContext {
  readonly image: string;
  readonly inputs: readonly CompilerPeActivationInput[];
  readonly redirections: readonly { name: string; file: string | null }[];
}

/** Query an executable or DLL context without initializing native pack code. */
export function readPeActivationContext(image: string, { systemDirectory, application, resource, observe }: {
  systemDirectory: string; application: string; resource: 1 | 2; observe?: (file: string) => void;
}): CompilerPeActivationContext {
  image = pePath(image);
  const inputs: CompilerPeActivationInput[] = [];
  const read = (file: string) => {
    observe?.(file);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    const bytes = stat?.isFile() ? fs.readFileSync(file) : undefined;
    inputs.push({ file, kind: bytes !== undefined ? 'file' : stat?.isDirectory() ? 'directory' : 'missing',
      hash: bytes === undefined ? null : createHash('sha256').update(bytes).digest('hex') });
    return bytes;
  };
  const bytes = read(image);
  if (!bytes) throw new Error(`Cannot inspect Windows activation image "${image}"`);
  const manifests = parsePeLibraryMetadata(bytes).manifests.filter(item => item.path[1] === resource);
  const external = resource === 1 ? read(image + '.manifest') : undefined;
  const configuration = image + (resource === 1 ? '.config' : '.2.config');
  read(configuration);
  if (!manifests.length && external === undefined) return { image, inputs, redirections: [] };
  try {
    const payload = JSON.stringify({ image, application, resource, configuration, inputs, manifests: manifests.map(item => item.bytes.toString('base64')),
      external: external?.toString('base64') }).replace(/[\u007f-\uffff]/g, value => '\\u' + value.charCodeAt(0).toString(16).padStart(4, '0'));
    const owner = cliPackageDirectory(typeof __filename === 'string' ? pathToFileURL(__filename).href : import.meta.url);
    const text = execFileSync(path.join(systemDirectory, 'WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-File', path.join(owner, 'bin/compiler-pe-context.ps1')],
      { input: payload, encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true });
    const value = JSON.parse(text.replace(/^\ufeff/, '')) as CompilerPeActivationContext & { error?: number; candidates?: string[] };
    if (typeof value.error === 'number') {
      if (!Array.isArray(value.candidates) || value.candidates.some(file => typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0'))) {
        throw new Error('Invalid OS refusal metadata');
      }
      for (const file of value.candidates) observe?.(file);
      throw Object.assign(new Error('OS context refusal'), { code: `Win32 ${value.error}` });
    }
    if (value.image !== image || !Array.isArray(value.inputs) || !Array.isArray(value.redirections)
      || value.inputs.some(item => !item || typeof item.file !== 'string' || !path.isAbsolute(item.file)
        || !['file', 'directory', 'missing'].includes(item.kind)
        || (item.kind === 'file' ? typeof item.hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash) : item.hash !== null))
      || inputs.some(expected => !value.inputs.some(item => item.file === expected.file && item.kind === expected.kind && item.hash === expected.hash))
      || value.redirections.some(item => !item || typeof item.name !== 'string' || !item.name
        || (item.file !== null && (typeof item.file !== 'string' || !path.isAbsolute(item.file))))) throw new Error('Invalid OS metadata');
    if (new Set(value.inputs.map(item => pePath(item.file).toLowerCase())).size !== value.inputs.length
      || new Set(value.redirections.map(item => item.name.toLowerCase())).size !== value.redirections.length) throw new Error('Duplicate OS metadata');
    return value;
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { status?: number; signal?: string };
    throw new Error(`Cannot inspect Windows activation context for "${image}": ${failure.code ?? failure.signal ?? failure.status ?? 'invalid OS metadata'}`);
  }
}
