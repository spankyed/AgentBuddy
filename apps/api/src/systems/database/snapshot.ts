import { promises as fs } from 'fs';
import path from 'path';
import { EARS } from '@/core/types';
import { 
  getAllEntities, 
  getAll, 
  getAttr,
  getAllAttributeKinds,
  getAllRelationKinds,
  putAttr,
  mergeAttr,
  addRelation,
  destroyEntity
} from '@/core/utils/ears/attribute-storage';

const SNAPSHOTS_DIR = path.join(process.cwd(), '/src/core/data/snapshots');
const GIT_SNAPSHOTS_DIR = path.join(process.cwd(), '/src/core/data/snapshots-git');

interface SnapshotData {
  version: string;
  timestamp: string;
  entities: Record<EARS.EntityId, Record<string, unknown>>;
  metadata: {
    entityCount: number;
    attributeKinds: string[];
    relationKinds: string[];
    excludedTypes?: string[];
    excludedRelations?: number;
  };
}

export async function createSnapshot(name?: string, excludeTypes: EARS.Entity[] = []): Promise<string> {
  // Ensure snapshots directory exists
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });

  // Helper function to check if an entity should be excluded
  const shouldExcludeEntity = (entityId: EARS.EntityId): boolean => {
    const entityType = entityId.split('-')[0] as EARS.Entity;
    return excludeTypes.includes(entityType);
  };

  // Collect all data
  const entities: Record<EARS.EntityId, Record<string, unknown>> = {};
  const allEntities = getAllEntities();
  let excludedRelationCount = 0;
  
  for (const entityId of allEntities) {
    // Skip if this entity type should be excluded
    if (shouldExcludeEntity(entityId)) {
      continue;
    }
    
    const entityData = getAll(entityId);
    
    // Special handling for Relation entities
    if (entityId.startsWith('Relation-')) {
      const relationDetails = entityData[EARS.AttrKind.RelationDetails] as EARS.RelationDetail | EARS.RelationDetail[] | undefined;
      
      if (relationDetails) {
        // Handle both single and array values
        const details = Array.isArray(relationDetails) ? relationDetails[0] : relationDetails;
        
        // Skip relations that involve excluded entity types
        if (details && (shouldExcludeEntity(details.sourceEntity) || shouldExcludeEntity(details.targetEntity))) {
          excludedRelationCount++;
          continue;
        }
      }
    }
    
    if (Object.keys(entityData).length > 0) {
      entities[entityId] = entityData;
    }
  }

  // Create snapshot data
  const snapshotData: SnapshotData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    entities,
    metadata: {
      entityCount: Object.keys(entities).length,
      attributeKinds: getAllAttributeKinds().map(k => String(k)),
      relationKinds: getAllRelationKinds(),
      excludedTypes: excludeTypes.length > 0 ? excludeTypes : undefined,
      excludedRelations: excludedRelationCount > 0 ? excludedRelationCount : undefined,
    },
  };

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = name 
    ? `snapshot-${name}-${timestamp}.json`
    : `snapshot-${timestamp}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);

  // Write snapshot to file
  await fs.writeFile(
    filepath, 
    JSON.stringify(snapshotData, null, 2),
    'utf-8'
  );

  return filename;
}

export async function loadSnapshot(filename: string): Promise<SnapshotData> {
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content) as SnapshotData;
}

export async function listSnapshots(): Promise<string[]> {
  try {
    const files = await fs.readdir(SNAPSHOTS_DIR);
    return files.filter(f => f.startsWith('snapshot-') && f.endsWith('.json'));
  } catch (error) {
    // Directory doesn't exist yet
    return [];
  }
}

export async function restoreSnapshot(snapshotData: SnapshotData): Promise<void> {
  // Clear existing data - delete all entities
  const currentEntities = getAllEntities();
  for (const entityId of currentEntities) {
    destroyEntity(entityId);
  }

  // Restore entities and their attributes
  for (const [entityId, attributes] of Object.entries(snapshotData.entities)) {
    for (const [attrKind, attrValue] of Object.entries(attributes)) {
      if (attrKind === EARS.AttrKind.RelationDetails) {
        // Handle relations specially
        if (Array.isArray(attrValue)) {
          for (const relDetail of attrValue) {
            const detail = relDetail as EARS.RelationDetail;
            if (detail.sourceEntity && detail.targetEntity && detail.relationType) {
              addRelation(
                detail.sourceEntity,
                detail.relationType,
                detail.targetEntity,
                detail.info
              );
            }
          }
        } else {
          const detail = attrValue as EARS.RelationDetail;
          if (detail.sourceEntity && detail.targetEntity && detail.relationType) {
            addRelation(
              detail.sourceEntity,
              detail.relationType,
              detail.targetEntity,
              detail.info
            );
          }
        }
      } else {
        // Handle regular attributes
        if (Array.isArray(attrValue)) {
          for (const val of attrValue) {
            putAttr(entityId as EARS.EntityId, attrKind as EARS.AttrKind, val);
          }
        } else {
          putAttr(entityId as EARS.EntityId, attrKind as EARS.AttrKind, attrValue);
        }
      }
    }
  }
}

export async function listGitSnapshots(): Promise<string[]> {
  try {
    const files = await fs.readdir(GIT_SNAPSHOTS_DIR);
    return files.filter(f => f.endsWith('.json') && f !== 'README.md');
  } catch (error) {
    // Directory doesn't exist yet
    return [];
  }
}

export async function loadGitSnapshot(filename: string): Promise<SnapshotData> {
  const filepath = path.join(GIT_SNAPSHOTS_DIR, filename);
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content) as SnapshotData;
}