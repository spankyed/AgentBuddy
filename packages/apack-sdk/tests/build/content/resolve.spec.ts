import { expect, it } from 'vitest';
import { resolveContentSources, type ContentDependency } from '../../../src/build/content/resolve.ts';
import type { ContentFormatConfig, PackManifest } from '../../../src/build/manifest.ts';

it.each(['sources', 'datasets'] as const)('resolves only declared local and dependency formats for content.%s', section => {
  const format: ContentFormatConfig = { compiler: 'src/compiler.ts', ...(section === 'sources' && { entity: 'Row' }) };
  const manifest = (ref: string, formats: Record<string, ContentFormatConfig> = { known: format }): PackManifest => ({
    id: 'consumer', name: 'Consumer', version: '1.0.0', dependencies: { base: '*' },
    content: { formats, [section]: { rows: { path: 'data', format: ref } } },
  });
  const dependency: ContentDependency = { manifest: { id: 'base', name: 'Base', version: '1.0.0', content: { formats: { known: format } } } };
  const dependencies = new Map([['base', dependency]]);
  const resolve = (manifest: PackManifest) => resolveContentSources(manifest, '/pack', dependencies, section);

  expect(() => resolve(manifest('constructor')))
    .toThrow('no format "constructor" in content.formats');
  expect(() => resolve(manifest('base:constructor')))
    .toThrow('dependency "base" has no format "constructor"');

  expect(resolve(manifest('constructor', { constructor: format })).rows)
    .toMatchObject({ kind: 'format', format });
  dependency.manifest.content = { formats: { constructor: format } };
  expect(resolve(manifest('base:constructor')).rows)
    .toMatchObject({ kind: 'format', format });
});
