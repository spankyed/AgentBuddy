import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { _packEntities, inspectContentReferences, parseContentIndex, CONTENT_INDEX_FILE, type ContentIndex } from '@apackdev/sdk/build';
import { PACK_LAYOUT, readPackBuild, readPackAsset, type PackBuild } from '@apackdev/host/packs';
import { errorMessage } from '@apackdev/sdk/utils/pure';
import { findPackRoot, readValidManifest } from '../utils';
import { inspectDependencies, describeDependency } from '../build/dependency-inspection.ts';

function inspectBuild(root: string, manifest: ReturnType<typeof readValidManifest>): {
  status: 'unbuilt' | 'verified' | 'stale' | 'invalid';
  directory: string;
  problem?: string;
  revision?: string;
  metadata?: { declarationRevision: string; format: number; sdkVersion?: string;
    entities: ReturnType<typeof _packEntities>; relations: PackBuild['snapshot']['types']['relKinds']; facades: string[] };
  content?: ContentIndex;
} {
  const directory = fs.existsSync(path.join(root, PACK_LAYOUT.integrity)) ? root : path.join(root, 'dist');
  if (!fs.existsSync(directory)) return { status: 'unbuilt', directory };
  try {
    const build = readPackBuild(directory);
    const indexFile = `${PACK_LAYOUT.contentDir}/${CONTENT_INDEX_FILE}`;
    const declaredContent = build.snapshot.manifest.content;
    if (!Object.hasOwn(build.integrity.files, indexFile)
      && (Object.keys(declaredContent?.sources ?? {}).length || Object.keys(declaredContent?.datasets ?? {}).length)) {
      throw new Error('Build is missing its declared compiled content index; rebuild the complete pack.');
    }
    const content = Object.hasOwn(build.integrity.files, indexFile)
      ? parseContentIndex(JSON.parse(readPackAsset(directory, build.snapshot.manifest.id, build.revision, indexFile).toString('utf8')))
      : undefined;
    if (content && content.packId !== build.snapshot.manifest.id) throw new Error(`Content index belongs to "${content.packId}", not "${build.snapshot.manifest.id}"`);
    const stale = !isDeepStrictEqual(manifest, build.snapshot.manifest);
    return { status: stale ? 'stale' : 'verified', directory, revision: build.revision,
      metadata: { declarationRevision: build.snapshot.declarationRevision, format: build.snapshot.format,
        sdkVersion: build.snapshot.sdkVersion, entities: _packEntities(build.snapshot.manifest),
        relations: build.snapshot.types.relKinds, facades: Object.keys(build.snapshot.facades) },
      ...(content && { content }), ...(stale && { problem: 'Built declarations differ from the current manifest; rebuild the pack.' }),
    };
  } catch (error) {
    return { status: 'invalid', directory, problem: errorMessage(error) };
  }
}

/** Inspect declarations, verified output and dependencies without importing pack modules or writing files. */
export async function inspectPack(root: string) {
  const manifest = readValidManifest(root);
  const dependencies = await inspectDependencies(root, manifest.dependencies);
  return { root, id: manifest.id, name: manifest.name, version: manifest.version, hostVersion: manifest.hostVersion,
    declared: {
      features: Object.entries(manifest.features ?? {}).map(([id, feature]) => ({ id, description: feature.description,
        ...(feature.plugin && { label: feature.plugin.label }) })),
      steps: Object.entries(manifest.extensions?.steps ?? {}).map(([type, declaration]) => ({ type, ...declaration })),
      services: Object.keys(manifest.extensions?.services ?? {}),
      appExtensions: Object.keys(manifest.extensions?.appExtensions ?? {}),
      tiptapPlugins: Object.entries(manifest.extensions?.tiptapPlugins ?? {}).map(([id, plugin]) => ({ id,
        extensions: Object.keys(plugin.extensions ?? {}), popups: Object.keys(plugin.popups ?? {}),
        isSuggestionActive: plugin.isSuggestionActive !== undefined })),
      entities: _packEntities(manifest), relations: manifest.data?.relations ?? [],
      content: { sources: Object.keys(manifest.content?.sources ?? {}), datasets: Object.keys(manifest.content?.datasets ?? {}) },
    },
    build: inspectBuild(root, manifest), dependencies: dependencies.entries,
  };
}

export async function info(args: string[]) {
  if (args.some(arg => arg !== '--json')) throw new Error('Usage: apack pack info [--json]');
  const report = await inspectPack(findPackRoot(process.cwd()));
  if (args.includes('--json')) { console.log(JSON.stringify(report)); return; }
  console.log(`Pack: ${report.id} (${report.name})\nVersion: ${report.version}\nHost: ${report.hostVersion ?? 'unrestricted'}\nRoot: ${report.root}`);
  console.log(`\nDeclared features (${report.declared.features.length}):`);
  for (const feature of report.declared.features) console.log(`  ${feature.id}${feature.label ? ` — ${feature.label}` : ''}: ${feature.description}`);
  console.log(`Declared steps: ${report.declared.steps.map(step => `${step.type} — ${step.node.defaultLabel ?? step.node.label}`).join(', ') || '(none)'}`);
  console.log(`Declared services: ${report.declared.services.join(', ') || '(none)'}`);
  console.log(`\nBuild: ${report.build.status}${report.build.revision ? `; revision ${report.build.revision}` : ''}`);
  if (report.build.problem) console.log(`  ${report.build.problem}`);
  if (report.build.content) {
    console.log('Compiled content:');
    for (const entry of report.build.content.entries) {
      console.log(`  ${entry.key}: ${entry.count} item(s)${entry.written ? '' : ' (dataset)'}`);
      for (const item of entry.items) console.log(`    ${item.key}${item.description ? ` — ${item.description}` : ''}`);
      console.log(`    Reference analysis: ${entry.references ? 'static only; computed targets may remain unknown' : 'unavailable'}`);
    }
    for (const reference of inspectContentReferences(report.build.content)) {
      console.log(`  ${reference.source.key}/${reference.source.item} (${reference.path}) → ${reference.target.key}/${reference.target.item ?? '(computed)'} [${reference.status}]`);
    }
    console.log('  Reference targets are checked against compiled inventory, not user data.');
  } else console.log(`Compiled content: ${report.build.status === 'verified' ? 'none' : 'unavailable'}`);
  if (report.dependencies.length) {
    console.log('\nDependencies:');
    for (const dependency of report.dependencies) console.log(`  ${describeDependency(dependency)}`);
  }
}
