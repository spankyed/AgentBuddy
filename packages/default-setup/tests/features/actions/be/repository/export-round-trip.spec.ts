import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { repository } from '@/__generated__/repository';
import { resetTestData } from '@abuddy/sdk/testing';
import { exportActions } from '@/features/actions/be/repository/export-actions';
import { exportPrompts } from '@/features/prompts/be/repository/export-prompts';
import { actionFixtures } from '../../../../_support/action-fixtures';
import { promptFixtures } from '../../../../_support/prompt-fixtures';

/**
 * Exporting actions and exporting prompts are one routine over two entity types: the same file written,
 * the same internal fields stripped, the same round trip back in. Only the entity's own portable fields
 * differ, so those are the parameter and everything else is asserted once.
 */
type Row = Record<string, unknown>;

interface ExportCase {
  name: string;
  /** The export, with its count read off whatever the result names it */
  run: (dir: string) => { filePath: string; count: number };
  fixtures: readonly Row[];
  seed: () => void;
  create: (item: Row) => void;
  all: () => readonly Row[];
  file: RegExp;
  /** Fields every fixture carries, and fields only some do */
  portable: readonly string[];
  optional: readonly string[];
}

const CASES: ExportCase[] = [
  {
    name: 'actions',
    run: (dir) => { const result = exportActions(dir); return { filePath: result.filePath, count: result.actionCount }; },
    fixtures: actionFixtures as unknown as readonly Row[],
    seed: () => { for (const fixture of actionFixtures) repository.actionCommands.create(fixture); },
    create: (item) => { repository.actionCommands.create(item as unknown as Parameters<typeof repository.actionCommands.create>[0]); },
    all: () => repository.actionQueries.all() as unknown as readonly Row[],
    file: /exported-actions\.json$/,
    portable: ['label', 'actionFn', 'input'],
    optional: ['description', 'category', 'output'],
  },
  {
    name: 'prompts',
    run: (dir) => { const result = exportPrompts(dir); return { filePath: result.filePath, count: result.promptCount }; },
    fixtures: promptFixtures as unknown as readonly Row[],
    seed: () => { for (const fixture of promptFixtures) repository.promptCommands.create(fixture); },
    create: (item) => { repository.promptCommands.create(item as unknown as Parameters<typeof repository.promptCommands.create>[0]); },
    all: () => repository.promptQueries.all() as unknown as readonly Row[],
    file: /exported-prompts\.json$/,
    portable: ['label', 'templateFn', 'inputs'],
    optional: ['description', 'category', 'outputSchema'],
  },
];

let tmpDir: string;

beforeEach(() => {
  resetTestData();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.each(CASES)('exporting $name', (testCase) => {
  const read = (filePath: string): Row[] => JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  it('writes every seeded row, and none when there are none', () => {
    const empty = testCase.run(tmpDir);
    expect(read(empty.filePath)).toEqual([]);
    expect(empty.count).toBe(0);

    testCase.seed();
    const seeded = testCase.run(tmpDir);
    expect(read(seeded.filePath)).toHaveLength(testCase.fixtures.length);
    expect(seeded.count).toBe(testCase.fixtures.length);
    expect(seeded.filePath).toMatch(testCase.file);
  });

  it('strips internal fields', () => {
    testCase.seed();
    for (const item of read(testCase.run(tmpDir).filePath)) {
      for (const field of ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt']) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });

  it('preserves portable fields', () => {
    testCase.seed();
    const exported = read(testCase.run(tmpDir).filePath);

    testCase.fixtures.forEach((fixture, index) => {
      const item = exported[index]!;
      for (const field of testCase.portable) expect(item[field], field).toEqual(fixture[field]);
      for (const field of testCase.optional) if (fixture[field]) expect(item[field], field).toEqual(fixture[field]);
    });
  });

  it('creates the directory when it does not exist', () => {
    testCase.seed();
    expect(fs.existsSync(testCase.run(path.join(tmpDir, 'a', 'b', 'c')).filePath)).toBe(true);
  });

  it('round-trips: re-importing what it wrote gives the portable fields back', () => {
    testCase.seed();
    const { filePath } = testCase.run(tmpDir);

    resetTestData();
    for (const item of read(filePath)) testCase.create(item);

    const all = testCase.all();
    expect(all).toHaveLength(testCase.fixtures.length);
    testCase.fixtures.forEach((fixture, index) => {
      for (const field of testCase.portable) expect(all[index]![field], field).toEqual(fixture[field]);
    });
  });
});
