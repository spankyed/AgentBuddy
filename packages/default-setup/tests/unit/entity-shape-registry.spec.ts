import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { BaseEntity } from '@abuddy/sdk/types';
import type { PackShapes, EntityShape } from '@/__generated__/ears';

// ─── PackShapes ─────────────────────────────────────────────
// These tests verify that the generated PackShapes in __generated__/ears.ts
// maps entity types to their shapes, and that EntityShape<E> resolves to the right type.

describe('PackShapes — augmented types', () => {
  it('registry has Action with label and actionFn', () => {
    expectTypeOf<PackShapes['Action']>().toHaveProperty('label');
    expectTypeOf<PackShapes['Action']>().toHaveProperty('actionFn');
  });

  it('registry has Thread with topic and status', () => {
    expectTypeOf<PackShapes['Thread']>().toHaveProperty('topic');
    expectTypeOf<PackShapes['Thread']>().toHaveProperty('status');
  });

  it('registry has Flow with label and flowType', () => {
    expectTypeOf<PackShapes['Flow']>().toHaveProperty('label');
    expectTypeOf<PackShapes['Flow']>().toHaveProperty('flowType');
  });

  it('registry has Document with name and content', () => {
    expectTypeOf<PackShapes['Document']>().toHaveProperty('name');
    expectTypeOf<PackShapes['Document']>().toHaveProperty('content');
  });

  it('registry has Prompt with label and templateFn', () => {
    expectTypeOf<PackShapes['Prompt']>().toHaveProperty('label');
    expectTypeOf<PackShapes['Prompt']>().toHaveProperty('templateFn');
  });

  it('registry has Message with sender and text', () => {
    expectTypeOf<PackShapes['Message']>().toHaveProperty('sender');
    expectTypeOf<PackShapes['Message']>().toHaveProperty('text');
  });
});

describe('EntityShape<E> — type resolution', () => {
  it('resolves registered entity to shape + BaseEntity', () => {
    type ActionShape = EntityShape<'Action'>;
    expectTypeOf<ActionShape>().toHaveProperty('label');
    expectTypeOf<ActionShape>().toHaveProperty('actionFn');
    expectTypeOf<ActionShape>().toHaveProperty('id');
    expectTypeOf<ActionShape>().toHaveProperty('entityType');
    expectTypeOf<ActionShape>().toHaveProperty('createdAt');
  });

  it('resolves Thread to shape + BaseEntity', () => {
    type ThreadShape = EntityShape<'Thread'>;
    expectTypeOf<ThreadShape>().toHaveProperty('topic');
    expectTypeOf<ThreadShape>().toHaveProperty('status');
    expectTypeOf<ThreadShape>().toHaveProperty('id');
    expectTypeOf<ThreadShape>().toHaveProperty('createdAt');
  });

  it('resolves Flow to shape + BaseEntity', () => {
    type FlowShape = EntityShape<'Flow'>;
    expectTypeOf<FlowShape>().toHaveProperty('label');
    expectTypeOf<FlowShape>().toHaveProperty('flowType');
    expectTypeOf<FlowShape>().toHaveProperty('id');
  });

  it('reads an undeclared entity as base fields plus unknown values, never any', () => {
    type UnknownShape = EntityShape<'SomeFutureEntity'>;
    expectTypeOf<UnknownShape>().toEqualTypeOf<BaseEntity & Record<string, unknown>>();
    expectTypeOf<UnknownShape['anything']>().toBeUnknown();
  });

  it('EntityShape includes BaseEntity fields for registered types', () => {
    type ActionShape = EntityShape<'Action'>;
    const shape = {} as ActionShape;
    expectTypeOf(shape.id).toMatchTypeOf<BaseEntity['id']>();
    expectTypeOf(shape.entityType).toMatchTypeOf<BaseEntity['entityType']>();
    expectTypeOf(shape.createdAt).toBeNumber();
  });

  it('Flow.flowType is narrowed to union', () => {
    type FlowShape = EntityShape<'Flow'>;
    expectTypeOf<FlowShape['flowType']>().toMatchTypeOf<'workflow' | 'integration'>();
  });

  it('Action.input is Record', () => {
    type ActionShape = EntityShape<'Action'>;
    expectTypeOf<ActionShape['input']>().toMatchTypeOf<Record<string, unknown>>();
  });

  it('Thread has optional fields typed correctly', () => {
    type ThreadShape = EntityShape<'Thread'>;
    expectTypeOf<ThreadShape['pinned']>().toMatchTypeOf<boolean | undefined>();
    expectTypeOf<ThreadShape['tags']>().toMatchTypeOf<string[] | undefined>();
  });
});

describe('PackShapes — extensibility', () => {
  it('keyof includes all augmented entity types', () => {
    type Keys = keyof PackShapes;
    expectTypeOf<'Action'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Thread'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Flow'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Document'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Prompt'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Secret'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Note'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Message'>().toMatchTypeOf<Keys>();
  });
});
