/** One item a seed key holds, as the import dialog lists it */
export interface PackSeedPreviewItem {
  /** What include sets name it by: a record's first identity field, a flow's name */
  key: string;
  description?: string;
  /** Tree records: how many children it has */
  childCount?: number;
}

/** The seeded keys of a compiled seeds directory and their items, from its seeds.json */
export interface PackSeedsPreview {
  directory: string;
  /** The pack that compiled the seeds */
  packId: string;
  seeds: Record<string, PackSeedPreviewItem[]>;
}
