// The memos plugin's contract: the state it publishes and what another plugin may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears`. Codegen reads the
// contract from here as a declared type, without resolving the machine — whose imports cycle back through
// `#generated/events`. `abuddy.json` names it at `features[].plugin.contract`.
import type { PluginInbox } from '@abuddy/sdk/fe'
import type { MemoDTO } from '#generated/types'
import type { MemoNoteDTO } from '../be/memo-notes'

export interface MemosContext {
  memos: MemoDTO[]
  notes: Array<{ text: string; note: MemoNoteDTO | null }>
  highlighted: string | null
}

/** What another feature may send this plugin */
export type MemosInbox = { type: 'MEMO.HIGHLIGHT'; memoId: string }

export type Contract = {
  state: MemosContext
  inbox: PluginInbox<{ public: MemosInbox }>
}
