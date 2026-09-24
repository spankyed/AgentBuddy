export {
  REFERENCE_TYPES,
  CATEGORIES,
  PROTOCOL_TO_TYPE,
  ALL_PROTOCOLS,
  categoryOfType,
} from '@/__generated__/references'
/** The reference type a note links as, by its note type */
export const NOTE_TYPE_TO_REFERENCE_TYPE: Record<string, string> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
}

export type ReferenceType = string
export type ReferenceCategory = string
