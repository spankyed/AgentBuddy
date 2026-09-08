import { findAll, repository } from '../ears/index';
import { loadJSON, shouldSeedAll, type Seeder, type SeederContext, type SeedCounts } from '../utils/index';
import { seedPath } from '../build/manifest';

export interface NotesSeederDeps {
  ears: any;
  importNotesFromData: (data: any) => { created: number; updated: number; skipped: number; errors: string[] };
}

export function createNotesSeeder(deps: NotesSeederDeps): Seeder {
  const { ears, importNotesFromData } = deps;
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
