/**
 * DSL Export Module
 * This module exports all types and functions needed for the EARS DSL
 * Used to generate type definitions for Monaco Editor
 */

// Core EARS types
export { EARS, BaseEntity } from '@/core/types'

// Query builder and core functions
export { qx } from '@/core/ears/helpers/query'

// Export all EARS attribute storage functions
export * from '@/core/ears/attribute-storage'

// Export all graph utilities
export * from '@/core/ears/helpers/graph'

// Transaction helpers
export { tx } from '@/core/ears/helpers/transaction'
export { AtomicTransaction } from '@/core/ears/helpers/atomic-transaction'

// Blueprint helpers for entity creation
export { bp, spawn } from '@/core/ears/helpers/blueprint'

// Import necessary functions for getSchemaStats
import { 
  getAllEntityTypes as _getAllEntityTypes,
  getEntitiesOfType as _getEntitiesOfType,
  getAllAttributeKinds as _getAllAttributeKinds,
  getAttributeStats as _getAttributeStats,
  getAllRelationKinds as _getAllRelationKinds
} from '@/core/ears/attribute-storage'

import { EARS as _EARS } from '@/core/types'
import { qx as _qx } from '@/core/ears/helpers/query'

// Schema statistics
export function getSchemaStats() {
  return {
    entities: _getAllEntityTypes().reduce((acc: Record<string, number>, type: string) => {
      acc[type] = _getEntitiesOfType(type as _EARS.Entity).length
      return acc
    }, {}),
    attributes: _getAllAttributeKinds().reduce((acc: Record<string, number>, kind: _EARS.AttrKind) => {
      acc[kind as string] = _getAttributeStats(kind).totalValues
      return acc
    }, {}),
    relations: _getAllRelationKinds().reduce((acc: Record<string, number>, kind: string) => {
      // This would need actual implementation to count relations
      acc[kind] = 0
      return acc
    }, {})
  }
}

// Type guard for entity checking
export function isEntity(value: unknown): value is _EARS.Entity {
  return Object.values(_EARS.Entity).includes(value as _EARS.Entity)
}

// Re-export types for convenience
export type QueryBuilder = ReturnType<typeof _qx>
export type EntityId = _EARS.EntityId
export type Entity = _EARS.Entity
export type RelKind = _EARS.RelKind
export type AttrKind = _EARS.AttrKind
// Don't re-export Blueprint as it's already available in EARS namespace