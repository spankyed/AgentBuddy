import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { EntityShapeRegistry, EntityShape, BaseEntity } from '@abuddy/sdk/types';
import '@/__generated__/entity-shapes';

// ─── EntityShapeRegistry augmentation ────────────────────────────────
// These tests verify that the declaration merging in entity-shapes.ts
// correctly augments the SDK's EntityShapeRegistry, and that
// EntityShape<E> resolves to the right type.

describe('EntityShapeRegistry — augmented types', () => {
  it('registry has Action with label and actionFn', () => {
    expectTypeOf<EntityShapeRegistry['Action']>().toHaveProperty('label');
    expectTypeOf<EntityShapeRegistry['Action']>().toHaveProperty('actionFn');
  });

  it('registry has Thread with topic and status', () => {
    expectTypeOf<EntityShapeRegistry['Thread']>().toHaveProperty('topic');
    expectTypeOf<EntityShapeRegistry['Thread']>().toHaveProperty('status');
  });

  it('registry has Flow with label and flowType', () => {
    expectTypeOf<EntityShapeRegistry['Flow']>().toHaveProperty('label');
    expectTypeOf<EntityShapeRegistry['Flow']>().toHaveProperty('flowType');
  });

  it('registry has Document with name and content', () => {
    expectTypeOf<EntityShapeRegistry['Document']>().toHaveProperty('name');
    expectTypeOf<EntityShapeRegistry['Document']>().toHaveProperty('content');
  });

  it('registry has Prompt with label and templateFn', () => {
    expectTypeOf<EntityShapeRegistry['Prompt']>().toHaveProperty('label');
    expectTypeOf<EntityShapeRegistry['Prompt']>().toHaveProperty('templateFn');
  });

  it('registry has Message with role and content', () => {
    expectTypeOf<EntityShapeRegistry['Message']>().toHaveProperty('role');
    expectTypeOf<EntityShapeRegistry['Message']>().toHaveProperty('content');
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

  it('falls back to Record<string, any> for unregistered entity', () => {
    type UnknownShape = EntityShape<'SomeFutureEntity'>;
    expectTypeOf<UnknownShape>().toEqualTypeOf<Record<string, any>>();
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

describe('EntityShapeRegistry — extensibility', () => {
  it('keyof includes all augmented entity types', () => {
    type Keys = keyof EntityShapeRegistry;
    expectTypeOf<'Action'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Thread'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Flow'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Document'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Prompt'>().toMatchTypeOf<Keys>();
    expectTypeOf<'CalendarEvent'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Note'>().toMatchTypeOf<Keys>();
    expectTypeOf<'Message'>().toMatchTypeOf<Keys>();
  });
});
