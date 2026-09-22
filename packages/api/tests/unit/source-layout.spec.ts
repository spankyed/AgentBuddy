// The API is a shell around @abuddy/host, and its folders are the jobs it does: `boot/` starts the process,
// `runtime/` opens this process's resources and binds the app, `transport/` is the wire to the renderer, and
// `adapters/` implements what the host's code is given. The renderer's tree says the same of itself
// (`packages/renderer/tests/source-layout.spec.ts`), with `views/` added, so the two read alike and a concept found
// in one is looked for in the same place in the other.
//
// A folder named for a layer rather than a job — core, shared, lib, utils, common, helpers — takes whatever nobody
// placed: `core/shared/debug/` held the log output, three words deep, for one importer. This says a new file belongs
// to one of the jobs, and that app runtime belongs in @abuddy/host rather than here at all.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** The jobs this package does, one folder each */
const JOBS = ['adapters', 'boot', 'runtime', 'transport'];

/** What may sit at the root of src/: the entry node runs, the types entry, and the virtual modules' declarations */
const ROOT_FILES = ['server.ts', 'types.ts', 'env.d.ts'];

const entries = () => fs.readdirSync(SRC, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));

describe('packages/api/src', () => {
  it('holds one folder per job, and no folder named for a layer', () => {
    const folders = entries().filter((e) => e.isDirectory()).map((e) => e.name).sort();

    expect(folders, 'app runtime belongs in @abuddy/host; a new folder here is a new job').toEqual(JOBS);
  });

  it('keeps at its root only the entry, the types entry and the virtual modules it declares', () => {
    const files = entries().filter((e) => e.isFile()).map((e) => e.name).sort();

    expect(files).toEqual([...ROOT_FILES].sort());
  });

  it('keeps its tests in tests/, as every other package does', () => {
    const inSrc = fs.readdirSync(SRC, { recursive: true })
      .map(String)
      .filter((f) => f.includes('__tests__') || /\.(spec|test)\.[cm]?[jt]sx?$/.test(f));

    expect(inSrc).toEqual([]);
  });

  it('renders nothing: no .vue here', () => {
    const vue = fs.readdirSync(SRC, { recursive: true }).map(String).filter((f) => f.endsWith('.vue'));

    expect(vue, 'views are the renderer\'s').toEqual([]);
  });
});
