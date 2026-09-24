/** One item a seed key holds, as the import dialog lists it */
export interface PackSeedPreviewItem {
  /** What include sets name it by: a record's first identity field, a flow's name */
  key: string;
  description?: string;
  /** Tree records: how many children it has */
  childCount?: number;
}

/** What importing a compiled seeds directory would seed: its seeded keys and their items, from its seeds.json */
export interface PackSeedsPreview {
  directory: string;
  /** The pack that compiled the seeds */
  packId: string;
  /** The keys the pack's registered seeders import */
  seeds: Record<string, PackSeedPreviewItem[]>;
  /** Seeded keys the pack registered no seeder for: an import leaves them out */
  unavailable: string[];
}
