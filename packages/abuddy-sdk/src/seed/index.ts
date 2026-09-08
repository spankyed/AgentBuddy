export { createCollectionSeeder } from './collection-seeder';
export { createFlowSeeder, type FlowSeederDeps } from './flow-seeder';
export { createLibrarySeeder } from './library-seeder';
export { createNotesSeeder, type NotesSeederDeps } from './notes-seeder';
export { createSettingsSeeder } from './settings-seeder';
export { createBootSeed, type BootSeedConfig } from './boot-seed';

export const STANDARD_SEED_DEFAULTS: Record<string, { entityType: string; lookupField: string }> = {
  actions: { entityType: 'Action', lookupField: 'label' },
  prompts: { entityType: 'Prompt', lookupField: 'label' },
};
