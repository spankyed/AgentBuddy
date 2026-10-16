import path from 'node:path';
import { createCompilerFileView } from './compiler-file-view.ts';
import type { CompilerInputObservations } from './compiler-observations.ts';
import type { CompilerMetadataKind } from './compiler-metadata.ts';

/** Replay native thread facts against originals immediately before synchronous publication checks. */
export function assertNativeCompilerObservations(observations: CompilerInputObservations): void {
  const view = createCompilerFileView(observations.root);
  const cursors = new Map<string, { file: string; options: unknown; index: number }>();
  try {
    for (const [encoded] of observations.entries) {
      const [kind, ...query] = JSON.parse(encoded);
      if (kind === 'file') view.readBytes(path.resolve(observations.root, query[0]));
      else if (kind === 'namespace') view.captureLocation(path.resolve(observations.root, query[0]), 'file');
      else if (kind === 'entries') view.captureLocation(path.resolve(observations.root, query[0]), 'entries');
      else if (kind === 'node-directory') view.readDirectoryData(path.resolve(observations.root, query[0]), query[1]);
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
    const current = new Map(view.observations().entries);
    for (const [query, expected] of observations.entries) {
      if (current.get(query) !== expected) throw new Error(`Compiler startup input changed: ${query}`);
    }
  } finally { view.dispose(); }
}
