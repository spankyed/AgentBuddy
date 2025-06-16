import { EARS } from '@/shared/ears/types';

export interface DatabaseQueryResult {
  nodes: Array<{
    id: EARS.EntityId;
    type: EARS.Entity;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: EARS.EntityId;
    target: EARS.EntityId;
    type: EARS.RelKind;
    data?: Record<string, unknown>;
  }>;
}

export interface DatabaseSchemaInfo {
  entities: Array<{
    type: EARS.Entity;
    // description?: string;
  }>;
  attributes: Array<{
    kind: string;
    // description?: string;
    entityTypes?: EARS.Entity[];
  }>;
  relations: Array<{
    kind: EARS.RelKind;
    // description?: string;
    sourceTypes?: EARS.Entity[];
    targetTypes?: EARS.Entity[];
  }>;
}

export interface DatabaseStartupData {
  schema: DatabaseSchemaInfo;
} 