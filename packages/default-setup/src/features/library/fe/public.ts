// The library plugin's ref, for the library's own reference items (references.ts). The library offers nothing else
// to other features.
import { ref as featureRef } from '@/__generated__/ref'

/** The ref the library plugin runs at */
export const LIBRARY = featureRef('library')
