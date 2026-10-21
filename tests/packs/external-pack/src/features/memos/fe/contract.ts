// The memos surface's contract: the state it publishes and what another surface may send it.
//
// A leaf: no machine, no other feature, and nothing from `#generated/*` but `types` and `ears`. Codegen reads the
// contract from here as a declared type, without resolving the machine — whose imports cycle back through
// `#generated/events`. `apack.json` names it at `features[].surface.contract`.
import type { SurfaceInbox } from '@apackdev/sdk/fe'
import type { MemoDTO } from '#generated/types.ts'
import type { MemoNoteDTO } from '../be/memo-notes.ts'

export interface MemosContext {
  memos: MemoDTO[]
  notes: Array<{ text: string; note: MemoNoteDTO | null }>
  highlighted: string | null
}

/** What another feature may send this surface */
export type MemosInbox = { type: 'MEMO.HIGHLIGHT'; memoId: string }

export type Contract = {
  opens: 'Memo'
  state: MemosContext
  inbox: SurfaceInbox<{ public: MemosInbox }>
}
