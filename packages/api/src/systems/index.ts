import { systems, allDefs, buildEventValidationMap } from '@/registries/systems';
import type { ApplicationOutgoingEvents } from '@/core/shared/system-errors';

export default systems;

type AllDefs = (typeof allDefs)[number];

export type IncomingSystemEvents = AllDefs['_incoming'];
export type OutgoingSystemEvents = AllDefs['_outgoing'] | ApplicationOutgoingEvents;

export const eventValidationMap = buildEventValidationMap();

export { backendSystem } from "@/systems/backend";
