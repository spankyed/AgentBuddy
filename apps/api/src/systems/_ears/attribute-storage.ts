/* attribute‑store.ts – generic edition */
import { isObject } from "@/shared/utils";
import { logInternal } from "@/systems/_ears/debug/Log";
import { createEntity } from "./create-entity";
import {
	updateIndex,
	relationIndex,
	addToIndex,
	removeFromIndex,
} from "./relation-index";
import { ECS } from "./types";

const attributeStore: ECS.AttributeStore = {};

function addAttribute(
	entityID: ECS.EntityId,
	attributeType: string,
	value: ECS.AttributeValue,
): void {
	if (!attributeStore[attributeType]) {
		attributeStore[attributeType] = {} as ECS.AttributeTypeMap;
	}

	if (!attributeStore[attributeType][entityID]) {
		attributeStore[attributeType][entityID] = []; // multiple attributes of the same type allowed
	}

	attributeStore[attributeType][entityID].push(value);

	logInternal("AA", false, attributeType, entityID, value);
}

function addRole(entityID: ECS.EntityId, roleName: string): void {
	addAttribute(entityID, "role", roleName);
}

// function addStatus(entityID: ECS.EntityId, roleName: string): void {
//   addAttribute(entityID, 'status', roleName);
// }

// function addState(entityID: ECS.EntityId, state: string): void {
//   addAttribute(entityID, 'status', roleName);
// }

function addRelation(
	sourceEntityID: ECS.EntityId,
	relationType: string,
	targetEntityID: ECS.EntityId,
	info?: ECS.AttributeValue,
): ECS.EntityId {
	const relationEntityID = createEntity(ECS.Entity.Relation, true);
	const relationDetails: ECS.RelationDetail = {
		sourceEntity: sourceEntityID,
		targetEntity: targetEntityID,
		relationType,
		info,
	};

	addAttribute(relationEntityID, "relationDetails", relationDetails);
	addToIndex(relationType, sourceEntityID, targetEntityID, relationEntityID);
	return relationEntityID;
}

function updateAttribute(
	entityID: ECS.EntityId,
	attributeType: string,
	newValue: ECS.AttributeValue,
	index = 0,
) {
	if (!attributeStore[attributeType]) {
		attributeStore[attributeType] = {};
	}

	const currentAttribute = getAttribute(entityID, attributeType);

	if (currentAttribute && isObject(currentAttribute) && isObject(newValue)) {
		attributeStore[attributeType][entityID][index] = {
			...currentAttribute,
			...newValue,
		};
	} else {
		attributeStore[attributeType][entityID][index] = newValue;
	}
	logInternal("AU", false, attributeType, entityID, newValue);
}

function updateAttributeByCriteria(
	entityID: ECS.EntityId,
	attributeType: string,
	criteria: ECS.AttributeValue,
	newValue: ECS.AttributeValue,
): void {
	const index = getAttributeIndexByCriteria(entityID, attributeType, criteria);
	if (index !== -1) {
		updateAttribute(entityID, attributeType, newValue, index);
	}
}

// Update a role for an entity
function updateRole(
	entityID: ECS.EntityId,
	oldRoleName: string,
	newRoleName: string,
): void {
	const roles = getAttributes(entityID, "role");
	const roleIndex = roles.indexOf(oldRoleName);
	if (roleIndex !== -1) {
		roles[roleIndex] = newRoleName; // Update the role
		updateAttribute(entityID, "role", roles); // Update the attribute in the store
	}
}

function updateRelation(
	relationEntityID: ECS.EntityId,
	newSourceEntityID?: ECS.EntityId,
	newTargetEntityID?: ECS.EntityId,
	newInfo?: ECS.AttributeValue,
): void {
	const relationDetails = getAttribute(
		relationEntityID,
		"relationDetails",
	) as ECS.RelationDetail | null;

	if (!relationDetails) return;

	let shouldUpdateIdx = false;
	const oldSourceEntityID = relationDetails.sourceEntity;
	const oldTargetEntityID = relationDetails.targetEntity;

	if (newSourceEntityID && newSourceEntityID !== oldSourceEntityID) {
		relationDetails.sourceEntity = newSourceEntityID;
		shouldUpdateIdx = true;
	}
	if (newTargetEntityID && newTargetEntityID !== oldTargetEntityID) {
		relationDetails.targetEntity = newTargetEntityID;
		shouldUpdateIdx = true;
	}
	if (newInfo !== undefined) relationDetails.info = newInfo;

	updateAttribute(relationEntityID, "relationDetails", relationDetails);

	if (shouldUpdateIdx) {
		updateIndex(
			relationDetails.relationType,
			relationEntityID,
			oldSourceEntityID,
			oldTargetEntityID,
			newSourceEntityID,
			newTargetEntityID,
		);
	}
}
function removeAttribute(
	entityID: ECS.EntityId,
	attributeType: string,
	index = 0,
): void {
	const typeMap = attributeStore[attributeType];

	if (!typeMap) return;

	let value = "";
	if (typeMap?.[entityID]) {
		value = typeMap[entityID][index];
		typeMap[entityID].splice(index, 1);
	}
	if (typeMap[entityID]?.length === 0) {
		delete typeMap[entityID];
	}
	logInternal("AR", false, attributeType, entityID, value);
}

function removeAttributeByCriteria(
	entityID: ECS.EntityId,
	attributeType: string,
	criteria: ECS.AttributeValue,
): void {
	const index = getAttributeIndexByCriteria(entityID, attributeType, criteria);
	if (index !== -1) {
		removeAttribute(entityID, attributeType, index);
	}
}

function removeRelation(relationEntityID: ECS.EntityId): void {
	const relationDetails = getRelation(relationEntityID);
	if (relationDetails) {
		removeFromIndex(
			relationDetails.relationType,
			relationDetails.sourceEntity,
			relationDetails.targetEntity,
			relationEntityID,
		);
		destroyEntity(relationEntityID);
		// removeAttribute(relationEntityID, 'relationDetails'); // just remove the relation details
	}
}

function removeRole(entityID: ECS.EntityId, roleName: string): void {
	removeAttributeByCriteria(entityID, "role", roleName);
}

function getAttributeIndexByCriteria(
	entityID: ECS.EntityId,
	attributeType: string,
	criteria: ECS.AttributeValue,
): number {
	const attributes = getAttributes(entityID, attributeType);
	return attributes.findIndex((attribute) =>
		isObject(criteria)
			? Object.entries(criteria).every(
					([key, value]) => attribute[key] === value,
				)
			: attribute === criteria,
	);
}

function getAttributesByType(attributeType: string): ECS.AttributeTypeMap {
	return attributeStore[attributeType] || [];
}

function getFirstAttributeByType(
	attributeType: string,
): ECS.AttributeValue | null {
	const attributes: ECS.AttributeTypeMap = getAttributesByType(attributeType);
	const entityID = Object.keys(attributes)[0] as ECS.EntityId;
	return entityID ? attributes[entityID][0] : null;
}

function getAttributes(
	entityID: ECS.EntityId,
	attributeType: string,
): ECS.AttributeValue[] {
	return attributeStore[attributeType]?.[entityID] || [];
}

function getAttribute(
	entityID: ECS.EntityId,
	attributeType: string,
	index = 0,
): ECS.AttributeValue | null {
	const attributes = getAttributes(entityID, attributeType);
	return attributes.length > index ? attributes[index] : null;
}

function getRoles(entityID: ECS.EntityId): string[] {
	return getAttributes(entityID, "role") as string[];
}

function hasRole(entityID: ECS.EntityId, roleName: string): boolean {
	const roles = getAttributes(entityID, "role");
	return roles.includes(roleName);
}

function hasRoleX(roleName: string): (item: ECS.AttributeValue) => boolean {
	return (item: ECS.AttributeValue) => hasRole(item, roleName);
}

function getRelation(
	relationEntityID: ECS.EntityId,
): ECS.RelationDetail | null {
	const relationAttributes = getAttributes(relationEntityID, "relationDetails");
	return relationAttributes.length > 0
		? (relationAttributes[0] as ECS.RelationDetail)
		: null;
}

function queryEntitiesByAttribute(
	attributeType: string,
	criteria?: ECS.AttributeValue,
): ECS.EntityId[] {
	const typeMap = attributeStore[attributeType];
	const entities = Object.keys(typeMap || {}) as ECS.EntityId[];

	if (!criteria) {
		return entities;
	}

	return entities.filter((entityID) =>
		isObject(criteria)
			? typeMap[entityID].some((attribute) =>
					Object.entries(criteria).every(
						([key, value]) => attribute[key] === value,
					),
				)
			: typeMap[entityID].includes(criteria),
	);
}

function queryEntitiesByRole(role: string): ECS.EntityId[] {
	return queryEntitiesByAttribute("role", role);
}

function queryEntitiesInRelationTo(
	targetEntityID: ECS.EntityId,
): ECS.EntityId[] {
	const getRelatedEntities = (
		index: { [entityID: string]: ECS.EntityId[] },
		inverse: boolean,
	) => {
		return (index[targetEntityID] || [])
			.map((relationEntityID) =>
				inverse
					? attributeStore.relationDetails[relationEntityID]?.[0]?.sourceEntity
					: attributeStore.relationDetails[relationEntityID]?.[0]?.targetEntity,
			)
			.filter((e) => e); // Filter out any undefined entries
	};

	const relatedEntities = Object.keys(relationIndex).reduce(
		(acc, relationType) => {
			const { bySource, byTarget } = relationIndex[relationType];
			return acc.concat(
				getRelatedEntities(bySource, false),
				getRelatedEntities(byTarget, true),
			);
		},
		[] as ECS.EntityId[],
	);

	return Array.from(new Set(relatedEntities)); // Return unique entities
}

function queryEntitiesByRelationTo(
	relationType: string,
	entityID: ECS.EntityId,
	isSource?: boolean,
): (ECS.EntityId | undefined)[] {
	const relationIDs =
		relationIndex[relationType]?.[isSource ? "bySource" : "byTarget"][
			entityID
		] || [];
	return relationIDs
		.map((relationID) => {
			const relationDetails = getRelation(relationID);
			return isSource
				? relationDetails?.targetEntity
				: relationDetails?.sourceEntity;
		})
		.filter((e) => e); // Filter out any undefined entries
}

function destroyEntity(entityID: ECS.EntityId): void {
	const directions = ["bySource", "byTarget"];

	for (const direction in Object.keys(relationIndex)) {
		for (const indexKey in directions) {
			const index =
				relationIndex[direction][
					indexKey as keyof (typeof relationIndex)[string]
				];

			if (index[entityID]) {
				for (const relationEntityID of index[entityID]) {
					const relationDetails = getRelation(relationEntityID);

					if (relationDetails) {
						// const oppositeIndexKey = relationDetails.sourceEntity === entityID ? 'byTarget' : 'bySource';
						const oppositeEntityID =
							relationDetails.sourceEntity === entityID
								? relationDetails.targetEntity
								: relationDetails.sourceEntity;

						removeFromIndex(
							direction,
							oppositeEntityID,
							entityID,
							relationEntityID,
						);
						removeAttribute(relationEntityID, "relationDetails");
					}
				}

				delete index[entityID]; // Remove the entity from the index
			}
		}
	}

	for (const attributeType in Object.keys(attributeStore)) {
		if (attributeStore[attributeType][entityID]) {
			delete attributeStore[attributeType][entityID]; // Remove the entity's attributes
		}
	}
}

export {
	// createEntity,
	destroyEntity,
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
	// queries
	getAttributes,
	getAttribute,
	getAttributesByType,
	getFirstAttributeByType,
	getRoles,
	hasRole,
	hasRoleX,
	getRelation,
	queryEntitiesByAttribute,
	queryEntitiesByRole,
	queryEntitiesInRelationTo,
	queryEntitiesByRelationTo,
};
