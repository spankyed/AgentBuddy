// Only an engine's creator writes to its state, through `admin`. An admin write imported from `@abuddy/ears`
// would be one without an engine, so no source in the repo imports one.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SELF = path.relative(ROOT, import.meta.filename);
/** Files that name an admin write only to check it is rejected */
const ALLOWED: Record<string, string> = { [SELF]: 'this guard' };

const ADMIN_WRITES = ['putAttr', 'addAttr', 'mergeAttr', 'dropAttr', 'dropIf', 'updateAttr', 'bulkLoadAttr', 'addRelation', 'updateRelation', 'edgeStore', 'relationIndex', 'addToIndex', 'removeFromIndex', 'updateIndex', 'queryEntitiesByRole'];
const EARS_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@abuddy\/ears['"]/g;

/** Every admin write `text` imports from @abuddy/ears */
export function engineStateAccess(text: string): string[] {
  const found: string[] = [];
  for (const [, names] of text.matchAll(EARS_IMPORT)) {
    for (const name of names.split(',').map((n) => n.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, ''))) {
      if (ADMIN_WRITES.includes(name)) found.push(`import { ${name} } from '@abuddy/ears'`);
    }
  }
  return found;
}

function sources(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'packages', 'scripts', 'tests'], { cwd: ROOT, encoding: 'utf-8' })
    .split('\n')
    .filter((file) => /\.(ts|mts|cts|js|mjs|cjs|vue)$/.test(file) && !/(^|\/)(dist|node_modules)\//.test(file))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

describe('engine state access', () => {
  it('goes through an engine instance everywhere', () => {
    const found = sources()
      .filter((file) => !(file in ALLOWED))
      .flatMap((file) => engineStateAccess(fs.readFileSync(path.join(ROOT, file), 'utf-8')).map((problem) => `${file}: ${problem}`));
    expect(found, 'create an engine with createEarsEngine and use its query and admin faces').toEqual([]);
  });

  it("finds an imported admin write, whatever it is renamed to, and leaves an engine's own alone", () => {
    expect(engineStateAccess("import { tx, type EarsAdmin, edgeStore as e } from '@abuddy/ears';")).toEqual(["import { edgeStore } from '@abuddy/ears'"]);
    expect(engineStateAccess("import { tx, untypedQx } from '@abuddy/ears';\nengine.admin.putAttr(id, k, v);")).toEqual([]);
  });
});
