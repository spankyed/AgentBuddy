import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { clearMemory } from '@/core/ears/attribute-storage';
import { repository } from '@/repository';
import { exportPrompts } from '@/systems/prompts/repository/export-prompts';
import { promptFixtures } from './helpers/prompt-fixtures';

/*─────────────────────────────────────────────────────────────────
 * Setup
 *─────────────────────────────────────────────────────────────────*/

let tmpDir: string;

beforeEach(() => {
  clearMemory();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-export-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedPrompts() {
  return promptFixtures.map(f => repository.promptCommands.create(f));
}

/*─────────────────────────────────────────────────────────────────
 * Tests
 *─────────────────────────────────────────────────────────────────*/

describe('exportPrompts', () => {
  it('exports all seeded prompts', () => {
    seedPrompts();
    const { filePath } = exportPrompts(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(exported).toHaveLength(promptFixtures.length);
  });

  it('strips internal fields', () => {
    seedPrompts();
    const { filePath } = exportPrompts(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const internalFields = ['id', 'entityType', 'createdAt', 'updatedAt', 'deleted', 'deletedAt'];
    for (const item of exported) {
      for (const field of internalFields) {
        expect(item).not.toHaveProperty(field);
      }
    }
  });

  it('preserves portable fields', () => {
    seedPrompts();
    const { filePath } = exportPrompts(tmpDir);
    const exported = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (let i = 0; i < promptFixtures.length; i++) {
      const fixture = promptFixtures[i];
      const item = exported[i];

      expect(item.label).toBe(fixture.label);
      expect(item.templateFn).toBe(fixture.templateFn);
      expect(item.inputs).toEqual(fixture.inputs);

      if (fixture.description) expect(item.description).toBe(fixture.description);
      if (fixture.category) expect(item.category).toBe(fixture.category);
      if (fixture.outputSchema) expect(item.outputSchema).toEqual(fixture.outputSchema);
    }
  });

  it('returns correct metadata', () => {
    seedPrompts();
    const result = exportPrompts(tmpDir);

    expect(result.filePath).toMatch(/exported-prompts\.json$/);
    expect(result.promptCount).toBe(promptFixtures.length);
  });

  it('creates directory if it does not exist', () => {
    seedPrompts();
    const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
    const result = exportPrompts(nestedDir);

    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('exports empty array when no prompts exist', () => {
    const result = exportPrompts(tmpDir);
    const exported = JSON.parse(fs.readFileSync(result.filePath, 'utf-8'));

    expect(exported).toEqual([]);
    expect(result.promptCount).toBe(0);
  });
});

describe('export → re-import round-trip', () => {
  it('re-imported prompts match original portable fields', () => {
    seedPrompts();
    const { filePath } = exportPrompts(tmpDir);

    // Clear and re-import
    clearMemory();
    const portable = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const item of portable) {
      repository.promptCommands.create(item);
    }

    const all = repository.promptQueries.all();
    expect(all).toHaveLength(promptFixtures.length);

    for (let i = 0; i < promptFixtures.length; i++) {
      const fixture = promptFixtures[i];
      const reimported = all[i];

      expect(reimported.label).toBe(fixture.label);
      expect(reimported.templateFn).toBe(fixture.templateFn);
      expect(reimported.inputs).toEqual(fixture.inputs);
    }
  });
});
