// Where search indices and FastEmbed's model weights live, under the app's data directory
import * as path from 'path'
import { getDataDirPath } from '@abuddy/sdk/utils'

export const getModelsCachePath = (): string => getDataDirPath('models-cache')
export const getSearchIndicesPath = (): string => getDataDirPath('search-indices')

export const getIndexPath = (indexId: string): string => path.join(getSearchIndicesPath(), indexId)
export const getIndexFilePath = (indexId: string): string => path.join(getIndexPath(indexId), 'index.usearch')
export const getIndexMetadataPath = (indexId: string): string => path.join(getIndexPath(indexId), 'metadata.json')
export const getIndexMappingsPath = (indexId: string): string => path.join(getIndexPath(indexId), 'mappings.json')
