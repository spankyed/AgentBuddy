import path from 'node:path';
import { createCompilerFileView } from './compiler-file-view.ts';
import { createCompilerInputObservations, type CompilerInputObservations } from './compiler-observations.ts';
import type { CompilerMetadataKind } from './compiler-metadata.ts';
import { readPackageDirectoryEntries } from '../package-inputs.ts';
import { packInputFiles } from '../pack-inputs.ts';

/** Replay captured filesystem facts against originals without activating a compiler. */
export function assertNativeCompilerObservations(observations: CompilerInputObservations): void {
  const authoredFiles = observations.entries.some(([query]) => JSON.parse(query)[0] === 'authored-files')
    ? packInputFiles(observations.root) : undefined;
  const view = createCompilerFileView(observations.root, { authoredFiles });
  const cursors = new Map<string, { file: string; options: unknown; index: number }>();
  const packages = createCompilerInputObservations(observations.root);
  try {
    for (const [encoded] of observations.entries) {
      const [kind, ...query] = JSON.parse(encoded);
      if (kind === 'authored-files') continue; // The view already owns the current authored inventory.
      if (kind === 'file') view.readDataBytes(path.resolve(observations.root, query[0]));
      else if (kind === 'namespace') view.captureDataLocation(path.resolve(observations.root, query[0]), 'file');
      else if (kind === 'entries') {
        const directory = path.resolve(observations.root, query[0]);
        view.captureDataLocation(directory, 'directory');
        view.captureLocation(directory, 'entries');
      } else if (kind === 'node-directory') view.readDirectoryData(path.resolve(observations.root, query[0]), query[1]);
      else if (kind === 'package-entries') packages.record([kind, ...query],
        readPackageDirectoryEntries(path.resolve(observations.root, query[0])).map(entry => entry.name));
      else if (kind === 'node-opendir') {
        const key = JSON.stringify(query.slice(0, 2));
        const previous = cursors.get(key);
        cursors.set(key, { file: path.resolve(observations.root, query[0]), options: query[1], index: Math.max(previous?.index ?? 0, query[2]) });
      } else if (kind === 'node-metadata') {
        try {
          const value = view.readMetadata(query[0] as CompilerMetadataKind, path.resolve(observations.root, query[1]), query[2]);
          if (query[3] === 'field') Reflect.get(value as object, query[4]);
        } catch {
          // Native refusals are observations too; compare their serialized outcome below.
        }
      } else throw new Error(`Unsupported native compiler observation: ${kind}`);
    }
    for (const { file, options, index } of cursors.values()) {
      const cursor = view.openDirectoryData(file, options);
      try { for (let position = 0; position <= index; position++) cursor.read(position); }
      catch { /* Compare the native terminal refusal below. */ }
    }
    const current = new Map(createCompilerInputObservations(observations.root,
      [view.observations(), packages.snapshot()]).snapshot().entries);
    for (const [query, expected] of observations.entries) {
      const actual = current.get(query);
      if (actual !== expected) {
        const details = ['namespace', 'entries'].includes(JSON.parse(query)[0]) ? ` (expected ${expected}; observed ${actual ?? 'unrecorded'})` : '';
        throw new Error(`Compiler startup input changed: ${query}${details}`);
      }
    }
  } finally { view.dispose(); }
}
