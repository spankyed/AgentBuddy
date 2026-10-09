// The packs feature's contract: what its system receives, what it sends its plugin, and its context.
// A leaf the system module doesn't import back, so codegen reads it without resolving the machine.

export type IncomingPacksEvents =
  | { type: 'INSTALL_PACK'; packSlug: string; source?: string }
  | { type: 'UNINSTALL_PACK'; packId: string }
  | { type: 'TOGGLE_PACK_ENABLED'; packId: string }
  | { type: 'UPDATE_PACK'; packId: string }
  | { type: 'CHECK_FOR_UPDATES' }
  | { type: 'GET_INSTALLED_PACKS' }
  // Seed orchestration: a pack's compiled seeds, read and imported. Here rather than in `settings`, which
  // only happens to be where the UI lives — what these do is pack-level, and this is the system that knows
  // packs. Their answers still go to the settings plugin, which draws them.
  | { type: 'PREVIEW_PACK_CONTENT'; directory: string }
  | { type: 'IMPORT_PACK_CONTENT'; directory: string; include?: Record<string, string[] | null>; mode?: 'keep-existing' | 'replace-on-collision' | 'wipe-and-replace'; restartBrain?: boolean }
