/*───────────────────────────────────────────────────────────────────────────
 * attribute-store.ts – Map‑backed, AttrKind‑typed (multi‑value safe)
 *───────────────────────────────────────────────────────────────────────────*/
import { isPlainObject } from "@/shared/utils";
import { logInternal } from "@/systems/_ears/debug/log";
import { createEntity } from "./create-entity";
import {
	addToIndex,
	removeFromIndex,
	updateIndex,
	relationIndex,
} from "./relation-index";
import { ECS } from "./types";

/*-------------------------------------------------------------------------*\
|   ▸ Internal store                                                        |
\*-------------------------------------------------------------------------*/
const store = new Map<ECS.AttrKind, Map<ECS.EntityId, ECS.AttributeValue[]>>();

const bucket = (kind: ECS.AttrKind) => {
	if (!store.has(kind)) store.set(kind, new Map());
	return store.get(kind) as Map<ECS.EntityId, ECS.AttributeValue[]>;
};

/*-------------------------------------------------------------------------*\
|   ▸ Core mutators                                                         |
\*-------------------------------------------------------------------------*/
function addAttribute(
	entityID: ECS.EntityId,
	kind: ECS.AttrKind,
	value: ECS.AttributeValue,
): void {
	const b = bucket(kind);
	if (!b.has(entityID)) b.set(entityID, []);
	const attributes = b.get(entityID);
	if (attributes) attributes.push(value); // multiple attrs of same kind allowed
	logInternal("AA", false, kind, entityID, value);
}

const addRole = (id: ECS.EntityId, role: string) =>
	addAttribute(id, ECS.AttrKind.Role, role);

function addRelation(
	source: ECS.EntityId,
	relationType: string,
	target: ECS.EntityId,
	info?: ECS.AttributeValue,
): ECS.EntityId {
	const relId = createEntity(ECS.Entity.Relation, true);
	const details: ECS.RelationDetail = {
		sourceEntity: source,
		targetEntity: target,
		relationType,
		info,
	};
	addAttribute(relId, ECS.AttrKind.RelationDetails, details);
	addToIndex(relationType, source, target, relId);
	return relId;
}

function updateAttribute(
	entityID: ECS.EntityId,
	kind: ECS.AttrKind,
	newValue: ECS.AttributeValue,
	index = 0,
): void {
	const b = bucket(kind);
	if (!b.has(entityID)) b.set(entityID, []);
	const list = b.get(entityID) || [];
	if (index < 0) return;
	if (index >= list.length) list.push(newValue);
	else {
		const current = list[index];
		list[index] =
			current && isPlainObject(current) && isPlainObject(newValue)
				? { ...current, ...newValue }
				: newValue;
	}
	logInternal("AU", false, kind, entityID, newValue);
}

function updateAttributeByCriteria(
	entityID: ECS.EntityId,
	kind: ECS.AttrKind,
	criteria: ECS.AttributeValue,
	newValue: ECS.AttributeValue,
) {
	const idx = getAttributeIndexByCriteria(entityID, kind, criteria);
	if (idx !== -1) updateAttribute(entityID, kind, newValue, idx);
}

const updateRole = (id: ECS.EntityId, oldR: string, newR: string) =>
	updateAttributeByCriteria(id, ECS.AttrKind.Role, oldR, newR);

function updateRelation(
	relId: ECS.EntityId,
	newSource?: ECS.EntityId,
	newTarget?: ECS.EntityId,
	newInfo?: ECS.AttributeValue,
): void {
	const d = getRelation(relId);
	if (!d) return;
	const { sourceEntity: oldS, targetEntity: oldT, relationType } = d;
	let touched = false;
	if (newSource && newSource !== oldS) {
		d.sourceEntity = newSource;
		touched = true;
	}
	if (newTarget && newTarget !== oldT) {
		d.targetEntity = newTarget;
		touched = true;
	}
	if (newInfo !== undefined) d.info = newInfo;
	updateAttribute(relId, ECS.AttrKind.RelationDetails, d);
	if (touched)
		updateIndex(
			relationType,
			relId,
			oldS,
			oldT,
			d.sourceEntity,
			d.targetEntity,
		);
}

/*-------------------------------------------------------------------------*\
|   ▸ Removal helpers                                                       |
\*-------------------------------------------------------------------------*/
function removeAttribute(
	entityID: ECS.EntityId,
	kind: ECS.AttrKind,
	index = 0,
): ECS.AttributeValue | undefined {
	const kindBucket = store.get(kind);
	const list = kindBucket?.get(entityID);
	if (!list) return undefined;
	const [removed] = list.splice(index, 1);
	if (!list.length && kindBucket) kindBucket.delete(entityID);
	logInternal("AR", false, kind, entityID, removed);
	return removed;
}

const removeAttributeByCriteria = (
	id: ECS.EntityId,
	kind: ECS.AttrKind,
	criteria: ECS.AttributeValue,
) => {
	const idx = getAttributeIndexByCriteria(id, kind, criteria);
	if (idx !== -1) removeAttribute(id, kind, idx);
};

function removeRelation(relId: ECS.EntityId): void {
	const d = getRelation(relId);
	if (!d) return;
	removeFromIndex(d.relationType, d.sourceEntity, d.targetEntity, relId);
	destroyEntity(relId);
}

const removeRole = (id: ECS.EntityId, role: string) =>
	removeAttributeByCriteria(id, ECS.AttrKind.Role, role);

/*-------------------------------------------------------------------------*\
|   ▸ Look‑ups / queries                                                    |
\*-------------------------------------------------------------------------*/
const matches = (criteria: ECS.AttributeValue) => (attr: ECS.AttributeValue) =>
	isPlainObject(criteria)
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		? Object.entries(criteria).every(([k, v]) => (attr as any)[k] === v)
		: attr === criteria;

function getAttributes(entityID: ECS.EntityId, kind: ECS.AttrKind) {
	return store.get(kind)?.get(entityID) ?? [];
}

const getAttribute = (id: ECS.EntityId, kind: ECS.AttrKind, idx = 0) =>
	getAttributes(id, kind)[idx] ?? null;

const getAttributeIndexByCriteria = (
	id: ECS.EntityId,
	kind: ECS.AttrKind,
	c: ECS.AttributeValue,
) => getAttributes(id, kind).findIndex(matches(c));

const getRoles = (id: ECS.EntityId) =>
	getAttributes(id, ECS.AttrKind.Role) as string[];
const hasRole = (id: ECS.EntityId, role: string) => getRoles(id).includes(role);
const hasRoleX = (role: string) => (item: ECS.AttributeValue) =>
	hasRole(item, role);

const getRelation = (relId: ECS.EntityId): ECS.RelationDetail | null =>
	(getAttributes(relId, ECS.AttrKind.RelationDetails)[0] ??
		null) as ECS.RelationDetail | null;

function queryEntitiesByAttribute(
	kind: ECS.AttrKind,
	criteria?: ECS.AttributeValue,
): ECS.EntityId[] {
	const b = store.get(kind);
	if (!b) return [];
	if (!criteria) return Array.from(b.keys());
	return Array.from(b.entries())
		.filter(([, list]) => list.some(matches(criteria)))
		.map(([id]) => id);
}

const queryEntitiesByRole = (role: string) =>
	queryEntitiesByAttribute(ECS.AttrKind.Role, role);

function queryEntitiesInRelationTo(target: ECS.EntityId): ECS.EntityId[] {
	const out = new Set<ECS.EntityId>();
	for (const relType of Object.keys(relationIndex)) {
		const { bySource, byTarget } = relationIndex[relType];
		for (const relId of bySource[target] ?? []) {
			const d = getRelation(relId);
			if (d) out.add(d.targetEntity);
		}
		for (const relId of byTarget[target] ?? []) {
			const d = getRelation(relId);
			if (d) out.add(d.sourceEntity);
		}
	}
	return [...out];
}

function queryEntitiesByRelationTo(
	relationType: string,
	entityID: ECS.EntityId,
	isSource = false,
): ECS.EntityId[] {
	const ids =
		relationIndex[relationType]?.[isSource ? "bySource" : "byTarget"][
			entityID
		] ?? [];
	return ids
		.map((relId) => {
			const d = getRelation(relId);
			return isSource ? d?.targetEntity : d?.sourceEntity;
		})
		.filter(Boolean) as ECS.EntityId[];
}

/*-------------------------------------------------------------------------*\
|   ▸ Entity teardown                                                       |
\*-------------------------------------------------------------------------*/
function destroyEntity(entityID: ECS.EntityId): void {
	for (const relType of Object.keys(relationIndex)) {
		const { bySource, byTarget } = relationIndex[relType];
		for (const dir of [bySource, byTarget]) {
			const relIds = dir[entityID] ?? [];
			for (const relId of relIds) {
				const d = getRelation(relId);
				if (d) removeFromIndex(relType, d.sourceEntity, d.targetEntity, relId);
				removeAttribute(relId, ECS.AttrKind.RelationDetails);
			}
			delete dir[entityID];
		}
	}
	for (const kind of store.keys()) bucket(kind).delete(entityID);
}

/*-------------------------------------------------------------------------*\
|   ▸ Public exports                                                        |
\*-------------------------------------------------------------------------*/
export {
	addAttribute,
	addRole,
	addRelation,
	updateAttribute,
	updateAttributeByCriteria,
	updateRole,
	updateRelation,
	removeAttribute,
	removeAttributeByCriteria,
	removeRole,
	removeRelation,
	getAttributes,
	getAttribute,
	getRoles,
	hasRole,
	hasRoleX,
	getRelation,
	queryEntitiesByAttribute,
	queryEntitiesByRole,
	queryEntitiesInRelationTo,
	queryEntitiesByRelationTo,
	destroyEntity,
};
