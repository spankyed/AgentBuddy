// // ecsRepo.ts
// import Database from "better-sqlite3";
// import { drizzle } from "drizzle-orm/better-sqlite3";
// import {
// 	entity,
// 	attrText,
// 	attrTime,
// 	attrInt,
// 	attrJson,
// 	role,
// 	relation,
// } from "./schema";
// import type { EARS } from "@/shared/ears/types";
// import {
// 	addAttribute,
// 	addRelation,
// 	addRole,
// 	createEntity,
// } from "@/shared/ears";

// const dbFile = process.env.DB_FILE || ":memory:";
// const sqlite = new Database(dbFile);
// export const db = drizzle(sqlite);

// /** write-behind queue */
// interface QOp {
// 	exec(): Promise<void>;
// }
// const queue: QOp[] = [];
// let flushing = false;
// const BATCH = 100;

// const push = (op: QOp) => {
// 	queue.push(op);
// 	if (queue.length >= BATCH) void flush();
// };

// export const flush = async () => {
// 	if (flushing || !queue.length) return;
// 	flushing = true;
// 	const batch = queue.splice(0);
// 	await db.transaction(async (tx) => {
// 		await Promise.all(batch.map((op) => op.exec.call({ tx })));
// 	});
// 	flushing = false;
// };

// if (typeof window !== "undefined" && "requestIdleCallback" in window) {
// 	requestIdleCallback(function idle() {
// 		flush().finally(() => requestIdleCallback(idle));
// 	});
// }

// export const repo = {
// 	async createEntity(t: EARS.Entity) {
// 		const id = `${t}-${Math.random().toString(36).slice(2)}` as EARS.EntityId;
// 		createEntity(id, t);
// 		push({
// 			exec: () =>
// 				db.insert(entity).values({ id, type: t, createdAt: Date.now() }),
// 		});
// 		return id;
// 	},

// 	async addAttribute(id: EARS.EntityId, kind: string, val: unknown, idx = 0) {
// 		addAttribute(id, kind, val, idx);
// 		const tbl =
// 			typeof val === "string"
// 				? attrText
// 				: val instanceof Date
// 					? attrTime
// 					: typeof val === "number"
// 						? attrInt
// 						: attrJson;
// 		push({
// 			exec: () =>
// 				db.insert(tbl).values({ entityId: id, kind, idx, value: val as any }),
// 		});
// 	},

// 	async addRelation(
// 		src: EARS.EntityId,
// 		kind: string,
// 		tgt: EARS.EntityId,
// 		info: any = {},
// 	) {
// 		addRelation(src, kind, tgt, info);
// 		push({
// 			exec: () =>
// 				db
// 					.insert(relation)
// 					.values({ srcId: src, kind, tgtId: tgt, info: JSON.stringify(info) }),
// 		});
// 	},

// 	async addRole(id: EARS.EntityId, r: string) {
// 		addRole(id, r);
// 		push({
// 			exec: () =>
// 				db.insert(role).values({ entityId: id, role: r }).onConflictDoNothing(),
// 		});
// 	},

// 	hydrate: async () => {
// 		// pull SQL into RAM once
// 		for (const e of await db.select().from(entity)) {
// 			createEntity(e.id as EARS.EntityId, e.type as EARS.Entity);
// 		}
// 		for (const tbl of [attrText, attrTime, attrInt, attrJson]) {
// 			for (const r of await db.select().from(tbl)) {
// 				addAttribute(r.entityId as EARS.EntityId, r.kind, r.value, r.idx);
// 			}
// 		}
// 		for (const r of await db.select().from(role)) {
// 			addRole(r.entityId as EARS.EntityId, r.role);
// 		}
// 		for (const r of await db.select().from(relation)) {
// 			addRelation(
// 				r.srcId as EARS.EntityId,
// 				r.kind,
// 				r.tgtId as EARS.EntityId,
// 				JSON.parse(r.info),
// 			);
// 		}
// 	},
// };
