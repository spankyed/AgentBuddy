/** One item a seed key holds, as the import dialog lists it */
export interface PackContentPreviewItem {
  /** What include sets name it by: a record's first identity field, a flow's name */
  key: string;
  description?: string;
  /** Tree records: how many children it has */
  childCount?: number;
}

/** What importing a compiled seeds directory would seed: its seeded keys and their items, from its seeds.json */
export interface PackContentPreview {
  directory: string;
  /** The pack that compiled the seeds */
  packId: string;
  /** The keys the pack's registered appliers import */
  content: Record<string, PackContentPreviewItem[]>;
  /** Seeded keys the pack registered no applier for: an import leaves them out */
  unavailable: string[];
}
