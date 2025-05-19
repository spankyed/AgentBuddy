// import type { Vector3 } from '@babylonjs/core';
// import * as EVTS from './Events';
// export namespace ECS {
//   export type EntityID = string;

//   export enum Entity {
//     // Entity Discriminators
//     Scene = 'Scene',
//     Camera = 'Camera',
//     Light = 'Light',
//     Character = 'Character',
//     Relation = 'Relation',
//     Task = 'Task',
//   }

//   export type ID = {
//     [K in Entity]: `${K}-${EntityID}`;
//   };

//   export const ATTRIBUTES = ['sceneData', 'cameraData', 'lightData', 'characterData', 'navigationData', 'behaviorData'] as const;

//   export const EVENTS = EVTS.Types.ALL_EVENTS;
//   export const EventType = EVTS.Types.EventType;
//   export const AttributeTypes = asEnum(...ATTRIBUTES);

//   export import Params = EVTS.Types.Params;

//   // Define a mapping between component types and their respective entity ID types
//   export type AttributeStore = {
//     sceneData: Record<ECS.ID['Scene'], SceneData>;
//     characterData: Record<ECS.ID['Character'], CharacterData>;
//     navigationData: Record<ECS.ID['Character'], NavigationData>;
//     cameraData: Record<ECS.ID['Camera'], CameraData>;
//     lightData: Record<ECS.ID['Light'], LightData>;
//     // interpretedData: Record<ECS.ID['Task'], TaskData>;
//   };
//   export type AttributeType = typeof ATTRIBUTES[number];
//   // export type AttributeDataForType<T extends AttributeType> = AttributeStore[T][keyof AttributeStore[T]];

//   export interface SceneData {
//     // entityId: ID['UserInput'];
//     scene: any;
//   }
//   export interface CharacterData {
//     // entityId: ID['UserInput'];
//     mesh: any;
//   }

//   export interface NavigationData {
//     path: Vector3[];
//     currDestination: Vector3;
//   }
//   export interface CameraData {
//     sceneCamera: any;
//   }
//   export interface LightData {
//     sceneLight: any;
//   }


//   export const TaskState = asEnum('PENDING', 'IN_PROGRESS', 'COMPLETED');
//   export interface TaskData {
//     // managerId?: ID['Manager'];
//     description: string;
//     // type: keyof typeof TaskType;
//     status: keyof typeof TaskState;
//     priority: 1 | 2 | 3;
//   }

//   // Systems
//   export interface SystemHandler<T = EVTS.Types.Params.Event> {
//     name: string;
//     match: (event: T) => boolean;
//     execute: (event: T) => Promise<any> | any;
//   }
//   export type System<T = EVTS.Types.Params.Event> = SystemHandler<T> | SystemHandler<T>[];
// }

// function asEnum<T extends string>(...elements: T[]): { [K in T]: K } {
//   return elements.reduce((acc, key) => {
//       acc[key] = key;
//       return acc;
//   }, {} as { [K in T]: K });
// }
