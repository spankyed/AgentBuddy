import path from 'node:path';
import { readPackageInputs, type PackageInputFile } from '@apackdev/host/build/package-inputs';
import type { BuildInputObserver } from '@apackdev/host/build/pack-inputs';
import type { CompilerReadSnapshot } from './compiler-read-tree.ts';

/** Materialize the existing package graph as one compiler read-tree contribution. */
export function captureCompilerPackage(directory: string, observe: BuildInputObserver,
  capture: (file: PackageInputFile, bytes: Buffer) => CompilerReadSnapshot['files'][number]) {
  const files: Array<CompilerReadSnapshot['files'][number]> = [];
  const locations: Array<CompilerReadSnapshot['locations'][number]> = [];
  const links: Array<CompilerReadSnapshot['links'][number]> = [];
  const graph = readPackageInputs([{ id: 'native', directory, contents: true }], {
    observe, onFile: (file, bytes) => { files.push(capture(file, bytes)); },
  });
  for (const node of graph.nodes) {
    locations.push(...node.directories.map(directory => ({ file: directory.source, physical: directory.source, kind: 'directory' as const })));
    links.push(...node.links.map(link => ({ file: path.join(node.directory, link.path), target: link.target })));
    for (const [name, index] of Object.entries(node.dependencies)) {
      if (index !== null) links.push({ file: node.lookups[name]!, target: graph.nodes[index]!.directory });
    }
  }
  return { graph, snapshot: { files, locations, links } };
}
