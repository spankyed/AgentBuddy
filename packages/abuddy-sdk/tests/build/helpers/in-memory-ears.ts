/**
 * Minimal in-memory EARS backend for testing compile/decompile round-trips.
 * Provides qx, tx, createEntity, clearMemory, edgeStore and registers them
 * with the SDK's runtime + host-module system so SDK code (decompiler etc.)
 * transparently uses this store.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initEARSRuntime } from '../../../src/ears/runtime';
import { registerHostModule } from '../../../src/runtime/host';

// ── Stores ──────────────────────────────────────────────────────

const entities = new Map<string, Map<string, unknown>>();
const relations: Array<{ id: string; source: string; kind: string; target: string; info: unknown }> = [];
const roles = new Map<string, Set<string>>();
const knownEntityTypes = new Set<string>();

let nextRelId = 0;

function clearMemory() {
  entities.clear();
  relations.length = 0;
  roles.clear();
  nextRelId = 0;
}

// ── Entity helpers ──────────────────────────────────────────────

function entityToObj(eid: string): Record<string, unknown> {
  const attrs = entities.get(eid);
  if (!attrs) return { id: eid };
  const obj: Record<string, unknown> = { id: eid };
  for (const [k, v] of attrs) obj[k] = v;
  return obj;
}

function ensureEntity(id: string) {
  if (!entities.has(id)) entities.set(id, new Map());
}

// ── createEntity ────────────────────────────────────────────────

function createEntity(entityType: string): string {
  const id = `${entityType}-${crypto.randomUUID().slice(0, 8)}`;
  knownEntityTypes.add(entityType);
  const attrs = new Map<string, unknown>();
  attrs.set('entityType', entityType);
  attrs.set('createdAt', Date.now());
  entities.set(id, attrs);
  return id;
}

// ── tx ──────────────────────────────────────────────────────────

function tx(typeOrId: string, useProvidedId = false) {
  let id: string;
  if (knownEntityTypes.has(typeOrId) && !useProvidedId) {
    id = createEntity(typeOrId);
  } else {
    id = typeOrId;
    ensureEntity(id);
  }

  const self: any = {
    batchPut(attrs: Record<string, unknown>) {
      const ent = entities.get(id)!;
      for (const [k, v] of Object.entries(attrs)) {
        ent.set(k, v);
        if (k === 'entityType' && typeof v === 'string') knownEntityTypes.add(v);
      }
      return self;
    },
    put(k: string, v: unknown) {
      entities.get(id)!.set(k, v);
      return self;
    },
    link(kind: string, target: string, info?: unknown) {
      const relId = `rel-${nextRelId++}`;
      relations.push({ id: relId, source: id, kind, target, info });
      return self;
    },
    grant(role: string) {
      if (!roles.has(id)) roles.set(id, new Set());
      roles.get(id)!.add(role);
      return self;
    },
    id: () => id,
  };
  return self;
}

// ── qx ──────────────────────────────────────────────────────────

function qx(seed?: string | string[]): any {
  let ids: string[];

  if (seed === undefined) {
    ids = [...entities.keys()];
  } else if (Array.isArray(seed)) {
    ids = seed.filter(id => entities.has(id));
  } else if (knownEntityTypes.has(seed)) {
    ids = [...entities.entries()]
      .filter(([, attrs]) => attrs.get('entityType') === seed)
      .map(([id]) => id);
  } else {
    ids = entities.has(seed) ? [seed] : [];
  }

  const self: any = {
    links(relKinds: string | string[], tgtType?: string | string[]) {
      const kinds = Array.isArray(relKinds) ? relKinds : [relKinds];
      const types = tgtType ? (Array.isArray(tgtType) ? tgtType : [tgtType]) : null;
      const results: Array<{ relation: string; id: string }> = [];
      for (const srcId of ids) {
        for (const rel of relations) {
          if (rel.source === srcId && kinds.includes(rel.kind)) {
            if (types) {
              const targetType = entities.get(rel.target)?.get('entityType');
              if (!targetType || !types.includes(targetType as string)) continue;
            }
            results.push({ relation: rel.kind, id: rel.target });
          }
        }
      }
      return results;
    },
    pickAll() {
      return ids.map(entityToObj);
    },
    withRole(role: string) {
      return qx(ids.filter(id => roles.get(id)?.has(role)));
    },
    first() { return ids[0] ?? null; },
    map: (fn: any) => ids.map(fn),
    filter: (fn: any) => qx(ids.filter(fn)),
    forEach(fn: any) { ids.forEach(fn); return self; },
    ids: () => [...ids],
    id: () => ids[0] ?? null,
    count: () => ids.length,
    exists: () => ids.length > 0,
  };
  return self;
}

// ── edgeStore ───────────────────────────────────────────────────

const edgeStore = {
  relIds(opts: { sourceEntity: string; relationType: string; targetEntity: string }) {
    return relations
      .filter(r => r.source === opts.sourceEntity && r.kind === opts.relationType && r.target === opts.targetEntity)
      .map(r => r.id);
  },
  find(opts: { sourceEntity: string; relationType: string; targetEntity: string }) {
    return relations.filter(
      r => r.source === opts.sourceEntity && r.kind === opts.relationType && r.target === opts.targetEntity,
    );
  },
};

// ── Setup ───────────────────────────────────────────────────────

let initialized = false;

export function setupInMemoryEARS() {
  if (initialized) return;
  initEARSRuntime({ qx, tx, createEntity });
  registerHostModule('attribute-storage', { clearMemory });
  registerHostModule('edge-store', { edgeStore });
  registerHostModule('relation-index', { relationIndex: new Map() });
  registerHostModule('paths', {
    ensureDirectoryExists(dirPath: string) {
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    },
    createExportDir(parentDir: string, systemName: string) {
      const fullPath = path.join(parentDir, systemName);
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
      return fullPath;
    },
  });
  registerHostModule('export', {
    writeExportJson(outputDir: string, filename: string, data: unknown) {
      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return filePath;
    },
  });
  initialized = true;
}
