import type { OutgoingPacksEvents } from '../../registration.ts';
// The packs feature's contract: what its system receives, what it sends its plugin, and its context.
// A leaf the system module doesn't import back, so codegen reads it without resolving the machine.

export type IncomingPacksEvents =
  | { type: 'INSTALL_PACK'; packSlug: string; source?: string }
  | { type: 'UNINSTALL_PACK'; packId: string }
  | { type: 'TOGGLE_PACK_ENABLED'; packId: string }
  | { type: 'UPDATE_PACK'; packId: string }
  | { type: 'CHECK_FOR_UPDATES' }
  | { type: 'GET_INSTALLED_PACKS' }
