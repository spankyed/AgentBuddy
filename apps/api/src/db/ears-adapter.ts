/*───────────────────────────────────────────────────────────────────────────
  PACKAGED "BAREBONES, PROD‑READY" ECS ↔ SQL ↔ MOCK DATA BUNDLE
  ───────────────────────────────────────────────────────────────────────────
  Files inside this single canvas (cut & move to src/ as you wish):

  1. schema.ts            – Drizzle tables (entity / attribute_* / role / relation)
  2. mockData.ts          – Realistic dataset expressed as table rows (no nesting)
  3. ecsRepo.ts           – Repository that hydrates, caches, and writes behind
  4. main.ts (example)    – Bootstraps, hydrates, runs a demo query
───────────────────────────────────────────────────────────────────────────*/

//───────────────────────────────────────────────────────────────────────────
// 1 ▸ schema.ts
//───────────────────────────────────────────────────────────────────────────
import {
	pgTable,
	varchar,
	text,
	timestamp,
	integer,
	jsonb,
} from "drizzle-orm/pg-core";

export const entity = pgTable("entity", {
	id: varchar("id", { length: 64 }).primaryKey(),
	type: text("type").notNull(),
	version: integer("version").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

function mkAttr(table: string, sqlType: any) {
	return pgTable(
		table,
		{
			entityId: varchar("entity_id", { length: 64 }).references(
				() => entity.id,
			),
			kind: text("kind").notNull(),
			idx: integer("idx").notNull().default(0),
			value: sqlType("value"),
		},
		(t) => ({ pk: [t.entityId, t.kind, t.idx] }),
	);
}
export const attrText = mkAttr("attribute_text", text);
export const attrTime = mkAttr("attribute_timestamp", timestamp);
export const attrInt = mkAttr("attribute_int", integer);
export const attrJson = mkAttr("attribute_json", jsonb);

export const role = pgTable(
	"role",
	{
		entityId: varchar("entity_id", { length: 64 }).references(() => entity.id),
		role: text("role").notNull(),
	},
	(t) => ({ pk: [t.entityId, t.role] }),
);

export const relation = pgTable(
	"relation",
	{
		srcId: varchar("src_id", { length: 64 }).references(() => entity.id),
		kind: text("kind").notNull(),
		tgtId: varchar("tgt_id", { length: 64 }).references(() => entity.id),
		info: jsonb("info").$type<Record<string, unknown>>().default({}),
	},
	(t) => ({ pk: [t.srcId, t.kind, t.tgtId] }),
);

//───────────────────────────────────────────────────────────────────────────
// 2 ▸ mockData.ts  (data expressed exactly like table rows)
//───────────────────────────────────────────────────────────────────────────
import { EARS } from "@/shared/ears/types";
import { entity, attrText, attrTime, role, relation } from "./schema";
import { sql } from "drizzle-orm";

export const now = new Date();
export const rows = {
	entity: [
		{ id: "Agent-demo", type: "Agent", createdAt: now },
		{ id: "Thread-ui", type: "Thread", createdAt: new Date(+now - 9 * 60_000) },
		{ id: "Msg-1", type: "Message", createdAt: new Date(+now - 5 * 60_000) },
		{ id: "Msg-2", type: "Message", createdAt: new Date(+now - 4 * 60_000) },
	],
	attrText: [
		{
			entityId: "Thread-ui",
			kind: "title",
			idx: 0,
			value: "UI Layout Reorganisation",
		},
		{
			entityId: "Msg-1",
			kind: "text",
			idx: 0,
			value: "How do I use CSS vars?",
		},
		{ entityId: "Msg-1", kind: "sender", idx: 0, value: "user" },
	],
	attrTime: [
		{
			entityId: "Thread-ui",
			kind: "timestamp",
			idx: 0,
			value: new Date(+now - 9 * 60_000),
		},
		{
			entityId: "Msg-1",
			kind: "timestamp",
			idx: 0,
			value: new Date(+now - 5 * 60_000),
		},
	],
	role: [
		{ entityId: "Thread-ui", role: EARS.RoleKind.Custom("latest_thread") },
	],
	relation: [
		{
			srcId: "Agent-demo",
			kind: EARS.RelKind.OWNS,
			tgtId: "Thread-ui",
			info: {},
		},
		{
			srcId: "Thread-ui",
			kind: EARS.RelKind.CONTAINS,
			tgtId: "Msg-1",
			info: {},
		},
		{
			srcId: "Thread-ui",
			kind: EARS.RelKind.CONTAINS,
			tgtId: "Msg-2",
			info: {},
		},
	],
};

//───────────────────────────────────────────────────────────────────────────
// 3 ▸ ecsRepo.ts – hydrate + write‑behind
//───────────────────────────────────────────────────────────────────────────
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
	entity,
	attrText,
	attrTime,
	attrInt,
	attrJson,
	role,
	relation,
} from "./schema";
import { eq, and } from "drizzle-orm";
import { randomId } from "@/shared/random-id";
import { inMemStore } from "@/shared/ears/attribute-storage";
import { EARS } from "@/shared/ears/types";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

/* write‑behind queue */
interface QOp {
	exec(): Promise<void>;
}
const q: QOp[] = [];
let flushing = false;
const BATCH = 100;
const push = (op: QOp) => {
	q.push(op);
	if (q.length >= BATCH) void flush();
};
export const flush = async () => {
	if (flushing || !q.length) return;
	flushing = true;
	const batch = q.splice(0);
	await db
		.transaction((tx) => Promise.all(batch.map((b) => b.exec.call({ tx }))))
		.finally(() => (flushing = false));
};
if (typeof window !== "undefined" && "requestIdleCallback" in window)
	requestIdleCallback(function idle() {
		flush().finally(() => requestIdleCallback(idle));
	});

/* helpers */
export const repo = {
	async createEntity(t: EARS.Entity) {
		const id = `${t}-${randomId()}` as EARS.EntityId;
		inMemStore.spawnEntity(id, t);
		push({
			exec: () =>
				db.insert(entity).values({ id, type: t, createdAt: new Date() }),
		});
		return id;
	},
	async addAttribute(id: EARS.EntityId, kind: string, val: unknown, idx = 0) {
		inMemStore.addAttribute(id, kind, val, idx);
		const tbl =
			typeof val === "string"
				? attrText
				: val instanceof Date
					? attrTime
					: typeof val === "number"
						? attrInt
						: attrJson;
		push({
			exec: () =>
				db.insert(tbl).values({ entityId: id, kind, idx, value: val as any }),
		});
	},
	async addRelation(
		src: EARS.EntityId,
		kind: string,
		tgt: EARS.EntityId,
		info: any = {},
	) {
		inMemStore.addRelation(src, kind, tgt, info);
		push({
			exec: () =>
				db.insert(relation).values({ srcId: src, kind, tgtId: tgt, info }),
		});
	},
	async addRole(id: EARS.EntityId, r: string) {
		inMemStore.addRole(id, r);
		push({
			exec: () =>
				db.insert(role).values({ entityId: id, role: r }).onConflictDoNothing(),
		});
	},
	hydrate: async () => {
		/* pull SQL into RAM once */
		const ents = await db.select().from(entity);
		for (const e of ents) {
			inMemStore.spawnEntity(e.id as EARS.EntityId, e.type as EARS.Entity);
		}
		const tables = [attrText, attrTime, attrInt, attrJson];
		for (const tbl of tables) {
			const rows = await db.select().from(tbl);
			for (const r of rows) {
				inMemStore.addAttribute(
					r.entityId as EARS.EntityId,
					r.kind,
					r.value,
					r.idx,
				);
			}
		}
		const roles = await db.select().from(role);
		for (const r of roles) {
			inMemStore.addRole(r.entityId as EARS.EntityId, r.role);
		}
		const rels = await db.select().from(relation);
		for (const r of rels) {
			inMemStore.addRelation(
				r.srcId as EARS.EntityId,
				r.kind,
				r.tgtId as EARS.EntityId,
				r.info,
			);
		}
	},
};

//───────────────────────────────────────────────────────────────────────────
// 4 ▸ main.ts – demo bootstrap                                            |
//───────────────────────────────────────────────────────────────────────────
import { db } from "./ecsRepo";
import * as mock from "./mockData";
import { repo } from "./ecsRepo";

async function seedIfEmpty() {
	const cnt = await db
		.select({ c: sql<number>`count(*)` })
		.from(entity)
		.limit(1)
		.then((r) => Number(r[0]?.c || 0));
	if (cnt) return;
	await db.transaction(async (tx) => {
		await tx.insert(entity).values(mock.rows.entity as any);
		await tx.insert(attrText).values(mock.rows.attrText as any);
		await tx.insert(attrTime).values(mock.rows.attrTime as any);
		await tx.insert(role).values(mock.rows.role as any);
		await tx.insert(relation).values(mock.rows.relation as any);
	});
}

(async () => {
	await seedIfEmpty();
	await repo.hydrate();
	console.log("Graph size:", inMemStore.size());
	// add a quick message
	const mId = await repo.createEntity(EARS.Entity.Message);
	await repo.addAttribute(mId, "text", "Hello Drizzle");
	await repo.addRole(mId, "last_message");
	await repo.addRelation("Thread-ui", EARS.RelKind.CONTAINS, mId);
	await flush();
	console.log("Done");
})();
