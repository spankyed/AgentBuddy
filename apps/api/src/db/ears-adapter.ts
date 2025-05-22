/*────────────────────────────────────────────────────────────────────────────
 FULL *ElectricSQL* REWRITE  (Postgres ↔ Electric sync ↔ local SQLite)
─────────────────────────────────────────────────────────────────────────────
 Folder layout created in this canvas:

   electric/
   ├─ schema.ts          – Drizzle schema fed into Electric codegen
   ├─ mockData.ts        – Flat table rows (same data as before)
   ├─ electric.ts        – Bootstraps the Electric client & local DB
   ├─ ecsRepo.ts         – Thin wrapper using live Electric client
   └─ demo.ts            – Seeds DB, hydrates RAM, shows quick mutation

 Requirements
 ────────────
 •  `npm i electric-sql postgres drizzle-orm`
 •  Run the Electric dev server (Docker) & `electric migrate` after editing
    schema.ts.  CLI generates `.electric/@types` & sync config.
────────────────────────────────────────────────────────────────────────────*/

//────────────────────────────────────────────────────────────────────────────
// 1 ▸ schema.ts  – drizzle definitions consumable by Electric codegen
//────────────────────────────────────────────────────────────────────────────
import {
  pgTable, varchar, text, timestamp, integer, jsonb,
} from 'drizzle-orm/pg-core';

export const entity = pgTable('entity', {
  id:        varchar('id', { length: 64 }).primaryKey(),
  type:      text('type').notNull(),
  version:   integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

function mkAttr(name: string, sqlType: any) {
  return pgTable(name, {
    entityId: varchar('entity_id', { length: 64 }).references(() => entity.id),
    kind:     text('kind').notNull(),
    idx:      integer('idx').notNull().default(0),
    value:    sqlType('value'),
  }, (t) => ({ pk: [t.entityId, t.kind, t.idx] }));
}
export const attrText  = mkAttr('attribute_text', text);
export const attrTime  = mkAttr('attribute_timestamp', timestamp);
export const attrInt   = mkAttr('attribute_int', integer);
export const attrJson  = mkAttr('attribute_json', jsonb);

export const role = pgTable('role', {
  entityId: varchar('entity_id', { length: 64 }).references(() => entity.id),
  role:     text('role').notNull(),
}, (t) => ({ pk: [t.entityId, t.role] }));

export const relation = pgTable('relation', {
  srcId: varchar('src_id', { length: 64 }).references(() => entity.id),
  kind:  text('kind').notNull(),
  tgtId: varchar('tgt_id', { length: 64 }).references(() => entity.id),
  info:  jsonb('info').$type<Record<string, unknown>>().default({}),
}, (t) => ({ pk: [t.srcId, t.kind, t.tgtId] }));

export const schema = {
  tables: {
    entity, attrText, attrTime, attrInt, attrJson, role, relation,
  },
} as const;   // Electric codegen expects this export

//────────────────────────────────────────────────────────────────────────────
// 2 ▸ mockData.ts
//────────────────────────────────────────────────────────────────────────────
import { EARS } from '@/shared/ears/types';
import { now } from '@/shared/utils/time';

export const rows = {
  entity: [
    { id: 'Agent-demo', type: 'Agent', createdAt: now() },
    { id: 'Thread-ui',  type: 'Thread',  createdAt: new Date(+now() - 9*60_000) },
    { id: 'Msg-1',      type: 'Message', createdAt: new Date(+now() - 5*60_000) },
  ],
  attrText: [
    { entityId:'Thread-ui', kind:'title', idx:0, value:'UI Layout Reorganisation' },
    { entityId:'Msg-1', kind:'text', idx:0, value:'How do I use CSS vars?' },
    { entityId:'Msg-1', kind:'sender', idx:0, value:'user' },
  ],
  attrTime: [
    { entityId:'Thread-ui', kind:'timestamp', idx:0, value: new Date(+now() - 9*60_000) },
    { entityId:'Msg-1', kind:'timestamp', idx:0, value: new Date(+now() - 5*60_000) },
  ],
  role: [
    { entityId:'Thread-ui', role:EARS.RoleKind.Custom('latest_thread') },
  ],
  relation: [
    { srcId:'Agent-demo', kind:EARS.RelKind.OWNS,      tgtId:'Thread-ui', info:{} },
    { srcId:'Thread-ui',  kind:EARS.RelKind.CONTAINS,  tgtId:'Msg-1',     info:{} },
  ],
};

//────────────────────────────────────────────────────────────────────────────
// 3 ▸ electric.ts  – bootstrap Electric client (Node version)
//────────────────────────────────────────────────────────────────────────────
import postgres from 'postgres';
import { electrify, ElectricDatabase } from 'electric-sql/node';
import { schema } from './schema';

// Remote Postgres for sync.
const pg = postgres(process.env.DATABASE_URL!);

// Local SQLite file (Node) or `:memory:`; browser would use IndexedDB.
export const electric: ElectricDatabase<typeof schema> = await electrify(
  { adapter: 'sqlite', url: 'file:ecs.db' },
  { schema, logger: { level: 'info' } },
  pg,
);

// `electric.db` now exposes drizzle‑ORM methods *and* live‑query reactivity.
export const db = electric.db;

//────────────────────────────────────────────────────────────────────────────
// 4 ▸ ecsRepo.ts – very thin wrapper: no queue, Electric handles sync
//────────────────────────────────────────────────────────────────────────────
import { db } from './electric';
import { entity, attrText, attrTime, attrInt, attrJson, role, relation } from './schema';
import { inMemStore } from '@/shared/ears/attribute-storage';
import { randomId } from '@/shared/random-id';
import { EARS } from '@/shared/ears/types';

export const ecsRepo = {
  async createEntity(t:EARS.Entity){
    const id=`${t}-${randomId()}` as EARS.EntityId;
    await db.insert(entity).values({ id, type:t, createdAt:new Date() });
    inMemStore.spawnEntity(id,t);
    return id;
  },
  async addAttribute(id:EARS.EntityId, kind:string, val:unknown, idx=0){
    const tbl = typeof val==='string'?attrText : val instanceof Date?attrTime : typeof val==='number'?attrInt : attrJson;
    await db.insert(tbl).values({ entityId:id, kind, idx, value:val as any });
    inMemStore.addAttribute(id,kind,val,idx);
  },
  async addRelation(src:EARS.EntityId, kind:string, tgt:EARS.EntityId, info:unknown={}){
    await db.insert(relation).values({ srcId:src, tgtId:tgt, kind, info });
    inMemStore.addRelation(src,kind,tgt,info);
  },
  async addRole(id:EARS.EntityId, r:string){
    await db.insert(role).values({ entityId:id, role:r }).onConflictDoNothing();
    inMemStore.addRole(id,r);
  },
  /** Hydrate RAM on cold start – Electric can stream entire tables reactively */
  async hydrate(){
    const ents = await db.select().from(entity); ents.forEach(e=>inMemStore.spawnEntity(e.id as EARS.EntityId,e.type as EARS.Entity));
    const tables=[attrText,attrTime,attrInt,attrJson];
    for(const tbl of tables){ const rows=await db.select().from(tbl); rows.forEach(r=>inMemStore.addAttribute(r.entityId as EARS.EntityId,r.kind,r.value,r.idx)); }
    const roles=await db.select().from(role); roles.forEach(r=>inMemStore.addRole(r.entityId as EARS.EntityId,r.role));
    const rels=await db.select().from(relation); rels.forEach(r=>inMemStore.addRelation(r.srcId as EARS.EntityId,r.kind,r.tgtId as EARS.EntityId,r.info));
  },
};

//────────────────────────────────────────────────────────────────────────────
// 5 ▸ demo.ts – seed postgres if empty, hydrate, run mutation               |
//────────────────────────────────────────────────────────────────────────────
import { db, electric } from './electric';
import { ecsRepo } from './ecsRepo';
import { rows } from './mockData';
import { sql } from 'drizzle-orm';
import { entity, attrText, attrTime, role, relation } from './schema';
import { inMemStore } from '@/shared/ears/attribute-storage';
import { EARS } from '@/shared/ears/types';

async function seed(){
  const c = await db.select({ c: sql<number>`count(*)` }).from(entity).limit(1).then(r=>Number(r[0]?.c||0));
  if(c) return;
  await db.transaction(async(tx)=>{
    await tx.insert(entity).values(rows.entity as any);
    await tx.insert(attrText).values(rows.attrText as any);
    await tx.insert(attrTime).values(rows.attrTime as any);
    await tx.insert(role).values(rows.role as any);
    await tx.insert(relation).values(rows.relation as any);
  });
}

(async () => {
  await seed();

  // initial replication from remote → local will begin here
  await ecsRepo.hydrate();

  console.log('Hydrated entities', inMemStore.entityCount());

  const mId = await ecsRepo.createEntity(EARS.Entity.Message);
  await ecsRepo.addAttribute(mId, 'text', 'Hello ElectricSQL');
  await ecsRepo.addRole(mId, 'last_message');
  await ecsRepo.addRelation('Thread-ui', EARS.RelKind.CONTAINS, mId);

  // Electric will sync this mutation up to Postgres automatically.
  console.log('Mutation committed – waiting for sync');
  await electric.notifier.waitForSynced();
  console.log('Remote DB is in sync');
})();
