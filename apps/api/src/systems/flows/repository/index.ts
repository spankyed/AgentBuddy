import { EARS } from "@/shared/ears/types";

export const edgeKinds = [
  EARS.RelKind.RESPONDER,
  EARS.RelKind.EMITS,
  EARS.RelKind.TRANSITIONS_TO,
] as EARS.RelKind[];

export * from './create';
export * from './read';
export * from './update';