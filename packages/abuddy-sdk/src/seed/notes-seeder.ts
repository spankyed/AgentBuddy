import { repository } from '../ears/index.js';
import { findAll } from '../ears/internals.js';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.js';
import { seedPath } from '../build/manifest.js';
import { importNotesFromData, type NotesEARS } from './import-notes.js';

export function createNotesSeeder(ears: NotesEARS): Seeder {
  const repo = repository as any;

  return {
    key: 'notes',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const notesData: any = loadJSON(seedPath(ctx.compiledDir, 'notes'));
      if (!notesData) {
        ctx.log('  notes artifact not found, skipping notes');
        return counts;
      }
      const filteredNotes = shouldSeedAll(ctx.include)
        ? notesData
        : {
            ...notesData,
            notes: (notesData.notes ?? []).filter((n: any) =>
              (ctx.include as ReadonlySet<string>).has(n.title),
            ),
          };
      if (ctx.mode === 'wipe-and-replace') {
        for (const n of findAll(ears.Entity.Note)) repo.noteCommands.delete((n as any).id);
        ctx.log('  notes wiped');
      }
      const importResult = importNotesFromData(filteredNotes, ears);
      counts.created = importResult.created;
      counts.updated = importResult.updated;
      counts.skipped = importResult.skipped;
      if (importResult.errors.length > 0) {
        importResult.errors.forEach((e: string) => console.warn(`[seed] notes: ${e}`));
      }
      return counts;
    },
  };
}
