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
  /**
   * The three ways a user resolves one content item, and each is a request they made about their own data.
   *
   * `RESTORE_CONTENT_ITEM` writes the pack's version over theirs — the one act in the app that does, which
   * is why it is its own event rather than a flag on another: it answers both "take the new version" on an
   * offer and "reset to factory" on anything they have edited. `DISMISS_CONTENT_OFFER` keeps theirs, against
   * the version they were shown, so the next release is silent and a change to the item itself asks again.
   * `DELETE_CONTENT_ITEM` is for an item the pack stopped shipping and they do not want to keep.
   */
  | { type: 'RESTORE_CONTENT_ITEM'; packId: string; key: string }
  | { type: 'DISMISS_CONTENT_OFFER'; packId: string; key: string }
  | { type: 'DELETE_CONTENT_ITEM'; packId: string; key: string }
