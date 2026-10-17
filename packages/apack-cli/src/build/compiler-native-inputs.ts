import path from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { compilerGlobDirectories } from './compiler-source-globs.ts';
import { readPackageInputs, type PackageInputs } from '@apackdev/host/build/package-inputs';
import type { readCompilerModuleInputs } from './compiler-module-inputs.ts';
import type { CompilerReadSnapshot } from './compiler-read-tree.ts';

type NativeInputView = ReturnType<typeof readCompilerModuleInputs>;
type PendingInputs = { files: Array<CompilerReadSnapshot['files'][number]>; locations: Array<CompilerReadSnapshot['locations'][number]>; links: Array<CompilerReadSnapshot['links'][number]> };

/** Admit lookup namespaces, not a second resolver: esbuild still selects files and package exports. */
export function createNativeInputReader(view: NativeInputView, initialPackages: PackageInputs,
  sourcePath: (file: string) => string, include: (snapshot: CompilerReadSnapshot) => void) {
  const directories = new Set<string>();
  const packages = new Set(initialPackages.nodes.map(node => node.directory));
  const configurations = new Map<string, ts.CompilerOptions>();
  const configFiles = new Set([...(view.configuration?.files.keys() ?? []), ...(view.declarationConfiguration?.files.keys() ?? [])]
    .filter(file => path.basename(file) !== 'package.json').map(sourcePath));
  const packageTargets = new Set<string>();
  const scopes = new Map<string, { options: ts.CompilerOptions; packageRoot?: string; imports?: Record<string, unknown> }>();
  let pending: PendingInputs;
  let primed = false;

  function location(file: string, kind: 'file' | 'directory' | 'entries') {
    const value = view.captureLocation(file, kind);
    if (value) pending.locations.push(value);
    pending.locations.push(...view.ancestors(file));
    return value;
  }
  function data(file: string) {
    const bytes = view.readBytes(file);
    if (bytes === undefined) return;
    pending.files.push(view.captureFile(file, bytes));
    location(file, 'file');
    location(path.dirname(file), 'directory');
    return view.fileSystem.readFile(file);
  }
  function configuration(file: string): ts.CompilerOptions {
    const known = configurations.get(file);
    if (known) return known;
    const parsed = ts.getParsedCommandLineOfConfigFile(file, {}, {
      ...ts.sys, ...view.fileSystem,
      readDirectory: () => [],
      readFile(file) {
        const text = data(file);
        if (text !== undefined) {
          const physical = sourcePath(view.fileSystem.realpath(file));
          if (path.basename(file) !== 'package.json') configFiles.add(physical);
        }
        return text;
      },
      // This reader observes configuration dependencies. The actual native compiler validates them.
      onUnRecoverableConfigFileDiagnostic() {},
    });
    const options = parsed?.options ?? {};
    configurations.set(file, options);
    return options;
  }
  function json(text: string | undefined): Record<string, unknown> | undefined {
    if (text === undefined) return;
    const parsed = ts.parseConfigFileTextToJson('metadata.json', text);
    return !parsed.error && parsed.config && typeof parsed.config === 'object' && !Array.isArray(parsed.config) ? parsed.config : undefined;
  }
  function scope(directory: string) {
    const known = scopes.get(directory);
    if (known) return known;
    let packageRoot: string | undefined;
    let imports: Record<string, unknown> | undefined;
    for (let current = directory; ; current = path.dirname(current)) {
      const file = path.join(current, 'package.json');
      if (view.fileSystem.fileExists(file)) {
        const metadata = json(data(file));
        packageRoot = current;
        if (metadata?.imports && typeof metadata.imports === 'object') imports = metadata.imports as Record<string, unknown>;
        break;
      }
      location(file, 'file');
      if (path.dirname(current) === current) break;
    }
    const file = view.configuration ? undefined : ts.findConfigFile(directory, view.fileSystem.fileExists);
    const options = view.configuration?.options ?? (file ? configuration(file) : {});
    const result = { options, packageRoot, imports };
    scopes.set(directory, result);
    return result;
  }
  function directory(file: string) {
    if (directories.has(file)) return;
    directories.add(file);
    // Native lookup may explicitly enter generated/dependency directories excluded from authored discovery.
    view.captureDataLocation(file, 'directory');
    const snapshot = view.resolutionDirectory(file);
    pending.locations.push(...snapshot.locations, ...view.ancestors(file));
    pending.files.push(...snapshot.files);
  }
  function packageInputs(file: string) {
    const physical = view.fileSystem.realpath(file);
    if (packages.has(physical)) return;
    packages.add(physical);
    const graph = readPackageInputs([{ id: 'native', directory: file, contents: true }], {
      observe: location,
      onFile(file, bytes) {
        pending.files.push(view.captureFile(file.source, bytes));
        if (!view.configuration && path.basename(file.source) === 'tsconfig.json') configuration(file.source);
      },
    });
    for (const node of graph.nodes) {
      packages.add(node.directory);
      pending.locations.push(...node.directories.map(directory => ({ file: directory.source, physical: directory.source, kind: 'directory' })));
      pending.links.push(...node.links.map(link => ({ file: path.join(node.directory, link.path), target: link.target })));
      for (const [name, index] of Object.entries(node.dependencies)) {
        if (index !== null) pending.links.push({ file: node.lookups[name]!, target: graph.nodes[index]!.directory });
      }
    }
  }
  function candidate(file: string) {
    directory(path.dirname(file));
    const owner = scope(path.dirname(file));
    // Native loaders read linked package assets without passing through Node's filesystem APIs.
    if (file.endsWith('.node') && owner.packageRoot) packageInputs(owner.packageRoot);
    if (view.fileSystem.directoryExists(file)) {
      directory(file);
      scope(file);
      if (view.fileSystem.fileExists(path.join(file, 'package.json'))) packageInputs(file);
      if (!packageTargets.has(file)) {
        packageTargets.add(file);
        const metadata = json(data(path.join(file, 'package.json')));
        for (const key of ['main', 'module']) {
          if (typeof metadata?.[key] === 'string') candidate(path.resolve(file, metadata[key]));
        }
      }
    }
  }
  function match(pattern: string, value: string): string | undefined {
    const star = pattern.indexOf('*');
    if (star < 0) return pattern === value ? '' : undefined;
    const before = pattern.slice(0, star), after = pattern.slice(star + 1);
    return value.startsWith(before) && value.endsWith(after) && value.length >= before.length + after.length
      ? value.slice(before.length, value.length - after.length) : undefined;
  }
  const requests = new Set<string>();
  function request(specifier: string, importer: string) {
    const key = JSON.stringify([specifier, importer]);
    if (requests.has(key)) return;
    requests.add(key);
    const metadata = scope(importer);
    if (path.isAbsolute(specifier) || specifier.startsWith('.')) {
      candidate(path.resolve(importer, specifier));
      return;
    }
    const base = metadata.options.baseUrl ?? metadata.options.pathsBasePath;
    for (const [pattern, targets] of Object.entries(metadata.options.paths ?? {})) {
      const value = match(pattern, specifier);
      if (value === undefined || typeof base !== 'string') continue;
      if (Array.isArray(targets)) for (const target of targets) {
        if (typeof target === 'string') candidate(path.resolve(base, target.replace('*', value)));
      }
    }
    if (typeof metadata.options.baseUrl === 'string') candidate(path.resolve(metadata.options.baseUrl, specifier));
    if (specifier.startsWith('#')) {
      function targets(value: unknown, replacement: string) {
        if (typeof value === 'string') request(value.startsWith('.') ? path.resolve(metadata.packageRoot!, value.replace('*', replacement)) : value.replace('*', replacement), metadata.packageRoot!);
        else if (value && typeof value === 'object') Object.values(value).forEach(value => targets(value, replacement));
      }
      for (const [pattern, value] of Object.entries(metadata.imports ?? {})) {
        const replacement = match(pattern, specifier);
        if (replacement !== undefined && metadata.packageRoot) targets(value, replacement);
      }
      return;
    }
    if (isBuiltin(specifier) || /^[a-z][\w+.-]*:/i.test(specifier)) return;
    const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
    for (let current = importer; ; current = path.dirname(current)) {
      const file = path.join(current, 'node_modules', name);
      const metadata = path.join(file, 'package.json');
      if (view.fileSystem.fileExists(metadata)) {
        directory(file);
        scope(file);
        packageInputs(file);
        if (!packageTargets.has(file)) {
          packageTargets.add(file);
          const entry = json(data(metadata));
          for (const key of ['main', 'module']) if (typeof entry?.[key] === 'string') candidate(path.resolve(file, entry[key]));
        }
      } else location(metadata, 'file');
      if (path.dirname(current) === current) break;
    }
  }
  function subtree(file: string, seen = new Set<string>()) {
    const physical = view.fileSystem.realpath(file);
    if (seen.has(physical)) return;
    seen.add(physical);
    directory(file);
    scope(file);
    for (const name of view.fileSystem.getDirectories(file)) subtree(path.join(file, name), seen);
  }
  return {
    prepareSource(file: string, contents: Buffer) {
      pending = { files: [], locations: [], links: [] };
      directory(path.dirname(file));
      scope(path.dirname(file));
      const source = ts.createSourceFile(file, contents.toString('utf8'), ts.ScriptTarget.Latest, false);
      for (const directory of compilerGlobDirectories(source)) subtree(directory);
      include(pending);
    },
    prepare(specifier: string, importer: string) {
      pending = { files: [], locations: [], links: [] };
      if (!primed) {
        primed = true;
        if (!view.configuration) for (const node of initialPackages.nodes) for (const file of node.files) {
          if (path.basename(file.path) === 'tsconfig.json') configuration(file.source);
        }
      }
      request(specifier, importer);
      include(pending);
    },
    projectMetadata(file: string, bytes: Buffer, readPath: (file: string) => string): Buffer {
      const config = configFiles.has(file), pkg = path.basename(file) === 'package.json';
      if (!config && !pkg) return bytes;
      const metadata = json(bytes.toString('utf8'));
      if (!metadata) return bytes;
      const absolute = (value: unknown) => typeof value === 'string' && path.isAbsolute(value) ? readPath(value) : value;
      function references(value: unknown): unknown {
        if (typeof value === 'string') return absolute(value);
        if (Array.isArray(value)) return value.map(references);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, references(value)]));
        return value;
      }
      if (pkg) {
        for (const key of ['main', 'module', 'types', 'typings', 'tsconfig', 'exports', 'imports', 'typesVersions', 'sideEffects']) {
          if (key in metadata) metadata[key] = references(metadata[key]);
        }
      }
      if (config) {
        metadata.extends = Array.isArray(metadata.extends) ? metadata.extends.map(absolute) : absolute(metadata.extends);
        const options = metadata.compilerOptions as Record<string, unknown> | undefined;
        if (options && typeof options === 'object' && !Array.isArray(options)) {
          options.baseUrl = absolute(options.baseUrl);
          if (options.paths && typeof options.paths === 'object' && !Array.isArray(options.paths)) options.paths = Object.fromEntries(Object.entries(options.paths)
            .map(([name, targets]) => [name, Array.isArray(targets) ? targets.map(absolute) : targets]));
        }
      }
      return Buffer.from(JSON.stringify(metadata));
    },
  };
}
