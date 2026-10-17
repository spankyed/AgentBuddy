import type { AnyStateMachine, SnapshotFrom } from 'xstate';
import type { BrainContext } from './contract.ts';

export const isShown = (snapshot: SnapshotFrom<AnyStateMachine>) => (snapshot.context as BrainContext).inspectEnabled;
