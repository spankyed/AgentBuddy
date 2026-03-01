import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { clearMemory } from '@/core/ears/attribute-storage';
import { repository } from '@/repository';
import { exportActions } from '@/systems/actions/export-actions';
import { actionFixtures } from './helpers/action-fixtures';

/*─────────────────────────────────────────────────────────────────
 * Setup
 *─────────────────────────────────────────────────────────────────*/

let tmpDir: string;

beforeEach(() => {
  clearMemory();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-export-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedActions() {
  return actionFixtures.map(f => repository.actionCommands.create(f));
}

/*─────────────────────────────────────────────────────────────────
 * Tests
 *─────────────────────────────────────────────────────────────────*/

describe('exportActions', () => {
  it('exports all seeded actions', () => {
    seedActions();
    const { filePath } = exportActions(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(exported).toHaveLength(actionFixtures.length);
  });

  it('strips internal fields', () => {
    seedActions();
    const { filePath } = exportActions(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const internalFields = ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt'];
    for (const item of exported) {
      for (const field of internalFields) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });

  it('preserves portable fields', () => {
    seedActions();
    const { filePath } = exportActions(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (let i = 0; i < actionFixtures.length; i++) {
      const fixture = actionFixtures[i];
      const item = exported[i];

      expect(item.label).toBe(fixture.label);
      expect(item.actionFn).toBe(fixture.actionFn);
      expect(item.input).toEqual(fixture.input);

      if (fixture.description) expect(item.description).toBe(fixture.description);
      if (fixture.category) expect(item.category).toBe(fixture.category);
      if (fixture.output) expect(item.output).toEqual(fixture.output);
    }
  });

  it('returns correct metadata', () => {
    seedActions();
    const result = exportActions(tmpDir);

    expect(result.filePath).toMatch(/exported-actions\.json$/);
    expect(result.actionCount).toBe(actionFixtures.length);
  });

  it('creates directory if it does not exist', () => {
    seedActions();
    const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
    const result = exportActions(nestedDir);

    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('exports empty array when no actions exist', () => {
    const result = exportActions(tmpDir);
    const exported = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));

    expect(exported).toEqual([]);
    expect(result.actionCount).toBe(0);
  });
});

describe('export → re-import round-trip', () => {
  it('re-imported actions match original portable fields', () => {
    seedActions();
    const { filePath } = exportActions(tmpDir);

    // Clear and re-import
    clearMemory();
    const portable = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const item of portable) {
      repository.actionCommands.create(item);
    }

    const all = repository.actionQueries.all();
    expect(all).toHaveLength(actionFixtures.length);

    for (let i = 0; i < actionFixtures.length; i++) {
      const fixture = actionFixtures[i];
      const reimported = all[i];

      expect(reimported.label).toBe(fixture.label);
      expect(reimported.actionFn).toBe(fixture.actionFn);
      expect(reimported.input).toEqual(fixture.input);
    }
  });
});
