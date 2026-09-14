import { builtinRepository } from '../ears/builtin-repositories.ts';
import { EARS } from '../types/entities.ts';
import type { NoteEntity } from '../types/sdk-entities.ts';
import type { ExportedNotes } from '../build/compilers/compile-notes.ts';
import { findAll } from '../ears/query-helpers.ts';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index.ts';
import { seedPath } from '../build/manifest.ts';
import { importNotesFromData } from './import-notes.ts';

export function createNotesSeeder(): Seeder {
  return {
    key: 'notes',
    seed(ctx: SeederContext): SeedCounts {
      const counts: SeedCounts = { created: 0, updated: 0, skipped: 0 };
      const notesData = loadJSON<ExportedNotes>(seedPath(ctx.compiledDir, 'notes'));
      if (!notesData) {
        ctx.log('  notes artifact not found, skipping notes');
        return counts;
      }
      const filteredNotes = shouldSeedAll(ctx.include)
        ? notesData
        : {
            ...notesData,
            notes: (notesData.notes ?? []).filter((n) =>
              (ctx.include as ReadonlySet<string>).has(n.title),
            ),
          };
      if (ctx.mode === 'wipe-and-replace') {
        for (const n of findAll<NoteEntity>(EARS.Entity.Note)) builtinRepository.noteCommands.delete(n.id);
        ctx.log('  notes wiped');
      }
      const importResult = importNotesFromData(filteredNotes);
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
