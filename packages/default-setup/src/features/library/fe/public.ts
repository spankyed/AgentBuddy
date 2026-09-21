// The library plugin's actor, for the library's own reference items (references.ts). The library offers nothing else
// to other features.
import { pluginHandle } from '@/features/plugin-handle'

/** The library plugin's actor, which its machine binds as it starts */
export const libraryPlugin = pluginHandle('library')
