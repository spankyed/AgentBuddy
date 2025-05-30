// qx.ts – fluent query wrapper around the EARS attribute store
import {
	/* entity scopes  */ getAllEntities, getEntitiesOfType,
	/* attrs / roles  */ getAttribute, getAttributesOfKind, getAllAttributes,
												getRoles, hasRole,
	/* relations      */ queryEntitiesByAttribute, queryEntitiesByRole,
												queryEntitiesInRelationTo, queryEntitiesByRelationTo,
												getRelation,
} from "@/shared/ears/attribute-storage";
import { EARS } from "@/shared/ears/types";
import { relationIndex } from "../relation-index";

/*─────────────────────────────────────────────────────────────
 * internal helpers
 *─────────────────────────────────────────────────────────────*/
const isEntityType = (v: unknown): v is EARS.Entity =>
	Object.values(EARS.Entity).includes(v as EARS.Entity);

const isOfType = (type: EARS.Entity) => (id: EARS.EntityId) =>
	id.startsWith(`${type}-`);

/*─────────────────────────────────────────────────────────────
 * qx – entry point
 *─────────────────────────────────────────────────────────────*/
export const qx = (
	seed?: EARS.EntityId | EARS.Entity | EARS.EntityId[],
) => {
	let ids: EARS.EntityId[] =
		seed === undefined          ? getAllEntities()                         :
		Array.isArray(seed)         ? [...seed]                                :
		isEntityType(seed)          ? getEntitiesOfType(seed)                  :
																	[seed as EARS.EntityId];

	const self = {
		/*──────────── filters ────────────*/
		ofType(type: EARS.Entity) {
			ids = ids.filter(isOfType(type));
			return self;
		},
		inIds(sub: EARS.EntityId[]) {
			const set = new Set(sub);
			ids = ids.filter(id => set.has(id));
			return self;
		},
		withAttr(kind: EARS.AttrKind, crit?: EARS.AttributeValue) {
			ids = crit === undefined
				? ids.filter(id => getAttributesOfKind(id, kind).length)
				: ids.filter(id =>
					queryEntitiesByAttribute(kind, crit).includes(id),
				);
			return self;
		},
		withRole(role: string) {
			ids = ids.filter(id => hasRole(id, role));
			return self;
		},
		relatedTo(target: EARS.EntityId) {
			const hits = new Set(queryEntitiesInRelationTo(target));
			ids = ids.filter(id => hits.has(id));
			return self;
		},
		related(relKind: string, other: EARS.EntityId, asSource = false) {
			const hits = new Set(
				queryEntitiesByRelationTo(relKind, other, asSource),
			);
			ids = ids.filter(id => hits.has(id));
			return self;
		},

		/*──────────── graph helper ────────────*/
		links<
			K extends string
		>(
			relKinds: K | readonly K[],
			targetType: EARS.Entity,
			asSource = true,
		): Array<{ relation: K; id: EARS.EntityId }> {
			const kinds   = Array.isArray(relKinds) ? relKinds : [relKinds];
			const out: Array<{ relation: K; id: EARS.EntityId }> = [];

			for (const src of ids) {
				for (const rel of kinds) {
					const targets = queryEntitiesByRelationTo(
						EARS.RelKind.Custom(rel as string),
						src,
						asSource,
					).filter(isOfType(targetType));

					for (const t of targets) out.push({ relation: rel, id: t });
				}
			}
			return out;
		},

		/*─────────────────────────────────────────────────────────────
		*  relation‑detail extractors  (insert just after links())
		*─────────────────────────────────────────────────────────────*/
		edgeIds(
			relationKinds?: string | readonly string[],
			asSource       = true,
		): EARS.EntityId[] {
			const kinds = relationKinds
				? (Array.isArray(relationKinds) ? relationKinds : [relationKinds])
				: Object.keys(relationIndex);

			const out: EARS.EntityId[] = [];
			for (const id of ids) {
				for (const k of kinds) {
					const dir = relationIndex[k];
					if (!dir) continue;
					out.push(...(asSource ? dir.bySource[id] : dir.byTarget[id]) ?? []);
				}
			}
			return [...new Set(out)]; // dedupe
		},

		edge<
			K extends string | readonly string[]
		>(
			relationKinds?: K,
			asSource       = true,
		): Array<{ relId: EARS.EntityId; detail: EARS.RelationDetail }> {
			return this.edgeIds(relationKinds as any, asSource).map(relId => ({
				relId,
				detail: getRelation(relId)!,
			}));
		},

		edgeOne(
			relationKinds?: string | readonly string[],
			asSource       = true,
		): { relId: EARS.EntityId; detail: EARS.RelationDetail } | null {
			const [relId] = this.edgeIds(relationKinds, asSource);
			return relId ? { relId, detail: getRelation(relId)! } : null;
		},

		/*──────────── data extractors ────────────*/
		ids: () => [...ids],
		count: () => ids.length,
		first: () => ids[0] ?? null,
		second: () => ids[1] ?? null,
		last: () => (ids.length ? ids[ids.length - 1] : null),
		exists: () => ids.length > 0,

		/* single attribute value – list vs one */
		value(kind: EARS.AttrKind, idx = 0) {
			return ids.map(id => getAttribute(id, kind, idx));
		},
		valueOne(kind: EARS.AttrKind, idx = 0) {
			return ids.length ? getAttribute(ids[0], kind, idx) : null;
		},

		/* all values for a kind */
		values(kind: EARS.AttrKind) {
			return ids.map(id => getAttributesOfKind(id, kind));
		},
		valuesOne(kind: EARS.AttrKind) {
			return ids.length ? getAttributesOfKind(ids[0], kind) : [];
		},

		/* field projection helpers */
		pick<const A extends readonly string[]>(fields: A):
			Array<{ [F in A[number]]: unknown }> {
			return ids.map(id => {
				const obj = {} as { [F in A[number]]: unknown };
				for (const f of fields)
					obj[f as keyof typeof obj] = getAttribute(id, EARS.AttrKind.Custom(f));
				return obj;
			});
		},
		pickOne<const A extends readonly string[]>(fields: A):
			{ [F in A[number]]: unknown } | null {
			if (!ids.length) return null;
			const id0 = ids[0];
			const obj = {} as { [F in A[number]]: unknown };
			for (const f of fields) {
				obj[f as keyof typeof obj] = getAttribute(id0, EARS.AttrKind.Custom(f));
			}
			return obj;
		},

		/* full record dump */
		record() {
			return ids.map(id => [id, getAllAttributes(id)] as const);
		},
		recordOne() {
			return ids.length ? getAllAttributes(ids[0]) : null;
		},

		/*──────────── functional helpers ────────────*/
		map<T>(fn: (id: EARS.EntityId) => T): T[] {
			return ids.map(fn);
		},
		forEach(fn: (id: EARS.EntityId) => void) {
			ids.forEach(fn);
			return self;
		},
		reduce<T>(fn: (acc: T, id: EARS.EntityId) => T, init: T) {
			return ids.reduce(fn, init);
		},
	};

	return self;
};