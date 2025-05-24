// tx.ts – fluent wrapper around the EARS attribute store
import {
	createEntity,
	destroyEntity,
	/* attributes */ addAttribute,
	updateAttribute,
	updateAttributeByCriteria,
	removeAttribute,
	removeAttributeByCriteria,
	/* roles      */ addRole,
	updateRole,
	removeRole,
	/* relations  */ addRelation,
	updateRelation,
	removeRelation,
	queryEntitiesByRole,
} from "@/shared/ears/attribute-storage";
import { EARS } from "@/shared/ears/types";

/** start a transaction on an existing entity or a new one */
export const tx = (entityOrId: EARS.Entity | EARS.EntityId) => {
	const isNew = Object.values(EARS.Entity).includes(entityOrId as EARS.Entity);
	const id = isNew
		? createEntity(entityOrId as EARS.Entity)
		: (entityOrId as EARS.EntityId);

	const self = {
		/*──────── attributes ────────*/
		set(k: EARS.AttrKind | string, v: unknown) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			addAttribute(id, k as any, v as any);
			return self;
		},
		update(k: EARS.AttrKind | string, v: unknown, idx?: number) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			updateAttribute(id, k as any, v as any, idx);
			return self;
		},
		updateWhere(k: EARS.AttrKind | string, crit: unknown, v: unknown) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			updateAttributeByCriteria(id, k as any, crit as any, v as any);
			return self;
		},
		delAttr(k: EARS.AttrKind | string, idx?: number) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			removeAttribute(id, k as any, idx);
			return self;
		},
		delAttrWhere(k: EARS.AttrKind | string, crit: unknown) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			removeAttributeByCriteria(id, k as any, crit as any);
			return self;
		},

		/*──────── roles ─────────────*/
		role(r: EARS.RoleKind) {
			addRole(id, r);
			return self;
		},
		updateRole(oldR: string, newR: string) {
			updateRole(id, oldR, newR);
			return self;
		},
		uniqueRole(kind: EARS.RoleKind, scope = queryEntitiesByRole(kind)) {
			for (const e of scope) removeRole(e, kind); // ensure uniqueness
			addRole(id, kind);
			return this;
		},
		delRole(r: string) {
			removeRole(id, r);
			return self;
		},

		/*──────── relations ─────────*/
		rel(kind: EARS.RelKind, target: EARS.EntityId, info?: unknown) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			addRelation(id, kind as any, target, info as any);
			return self;
		},
		updateRel(
			relId: EARS.EntityId,
			src?: EARS.EntityId,
			tgt?: EARS.EntityId,
			info?: unknown,
		) {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			updateRelation(relId, src, tgt, info as any);
			return self;
		},
		delRel(relId: EARS.EntityId) {
			removeRelation(relId);
			return self;
		},

		/*──────── lifecycle ─────────*/
		destroy() {
			destroyEntity(id);
			return undefined as never;
		},

		/*──────── done ──────────────*/
		id: () => id,
	};

	return self;
};
