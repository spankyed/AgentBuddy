import type { Dbs } from './env';

type Encoded = { t: string; v: any };

function enc(value: unknown): Encoded {
  if (value instanceof Date) return { t: 'date', v: value.toISOString() };
  const t = value === null ? 'null'
    : Array.isArray(value) ? 'array'
    : typeof value === 'object' ? 'object'
    : typeof value; // string|number|boolean|undefined (avoid undefined)
  return { t, v: value };
}

function attrKey(kind: string, entityId: string, idx: number) {
  return `${kind}\x1F${entityId}\x1F${idx}`; // \x1F = unit separator
}

const entTypeOf = (id: string) => id.split('-')[0] ?? id;

export function makeLmdbAdapter(dbs: Dbs) {
  const { entities, attrs, relations } = dbs;

  const queue: (() => void)[] = [];
  let scheduled = false;

  function schedule(op: () => void) {
    queue.push(op);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        // Use transactionSync on any DB - they share the same environment
        entities.transactionSync(() => {
          for (const run of queue.splice(0)) run();
        });
      });
    }
  }

  function ensureEntity(id: string) {
    // idempotent: put only if missing
    if (!entities.doesExist(id)) {
      entities.put(id, { type: entTypeOf(id), createdAt: Date.now() });
    }
  }

  return {
    onCreateEntity(entityId: string, type?: string) {
      schedule(() => {
        if (!entities.doesExist(entityId)) {
          entities.put(entityId, { type: type ?? entTypeOf(entityId), createdAt: Date.now() });
        }
      });
    },

    onDestroyEntity(entityId: string) {
      schedule(() => {
        const rec = entities.get(entityId);
        if (rec) entities.put(entityId, { ...rec, deletedAt: Date.now() });
        // Hard-delete attrs and relations that reference this entity is optional; you already
        // handle teardown in memory, and on next startup you won't rebuild deleted entities.
        // If you want hard deletes, you'd need to scan attrs/relations; usually not needed.
      });
    },

    onPutAttr(kind: string, entityId: string, idx: number, value: unknown) {
      schedule(() => {
        ensureEntity(entityId);
        attrs.put(attrKey(kind, entityId, idx), enc(value));
      });
    },

    onDropAttr(kind: string, entityId: string, idx: number) {
      schedule(() => {
        attrs.remove(attrKey(kind, entityId, idx));
      });
    },

    onAddRelation(relId: string, kind: string, src: string, tgt: string, info: unknown) {
      schedule(() => {
        ensureEntity(src);
        ensureEntity(tgt);
        relations.put(relId, { kind, src, tgt, info: info ?? null, createdAt: Date.now() });
      });
    },

    onUpdateRelation(relId: string, patch: { src?: string; tgt?: string; info?: unknown }) {
      schedule(() => {
        const r = relations.get(relId);
        if (!r) return;
        if (patch.src) { ensureEntity(patch.src); r.src = patch.src; }
        if (patch.tgt) { ensureEntity(patch.tgt); r.tgt = patch.tgt; }
        if ('info' in patch) r.info = patch.info ?? null;
        relations.put(relId, r);
      });
    },

    onRemoveRelation(relId: string) {
      schedule(() => {
        relations.remove(relId);
      });
    },
  };
}