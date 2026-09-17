// Compile-time checks, run by `tsc` (npm run typecheck:pack). Exact type equality fails when a
// generated entity shape regresses to `any` or loses its declared field types.
import { describe, expectTypeOf, it } from 'vitest';
import type { BaseEntity } from '@abuddy/ears';
import type { SdkEntityShapes, ActionEntity, FlowEntity, NodeBase } from '@abuddy/sdk';
import type { NodeEntity } from '@/__generated__/types';
import type { EntityShape, OwnEntityShapes, PackShapes } from '@/__generated__/ears';
import type { MessageEntity, ThreadEntity } from '@/features/threads/be/types';

describe('PackShapes', () => {
  it('maps declared entities to their shape types', () => {
    expectTypeOf<OwnEntityShapes['Thread']>().toEqualTypeOf<ThreadEntity>();
    expectTypeOf<OwnEntityShapes['Message']>().toEqualTypeOf<MessageEntity>();
  });

  it("includes the SDK's shapes, which the pack's feature types re-export", () => {
    expectTypeOf<PackShapes['TNode']>().toEqualTypeOf<SdkEntityShapes['TNode']>();
    expectTypeOf<PackShapes['Action']>().toEqualTypeOf<ActionEntity>();
    expectTypeOf<PackShapes['Flow']>().toEqualTypeOf<FlowEntity>();
    expectTypeOf<PackShapes['Relation']>().toEqualTypeOf<SdkEntityShapes['Relation']>();
  });

  it("reads Node rows as the pack's step node types, not the SDK's NodeBase", () => {
    expectTypeOf<SdkEntityShapes['Node']>().toEqualTypeOf<NodeBase>();
    expectTypeOf<PackShapes['Node']>().toEqualTypeOf<NodeEntity>();
  });

  it('has no key for an undeclared entity', () => {
    // @ts-expect-error not declared in abuddy.json entityShapes
    expectTypeOf<OwnEntityShapes['SomeFutureEntity']>().toBeNever();
  });
});

describe('EntityShape<E>', () => {
  it('types declared fields exactly, with the base entity fields', () => {
    expectTypeOf<EntityShape<'Action'>['actionFn']>().toEqualTypeOf<string>();
    expectTypeOf<EntityShape<'Thread'>['topic']>().toEqualTypeOf<string>();
    expectTypeOf<EntityShape<'Thread'>['pinned']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<EntityShape<'Flow'>['flowType']>().toEqualTypeOf<'workflow' | 'integration'>();
    expectTypeOf<EntityShape<'Message'>['sender']>().toEqualTypeOf<'user' | 'assistant' | 'system' | 'marker'>();
    expectTypeOf<EntityShape<'Action'>['createdAt']>().toEqualTypeOf<number>();
  });

  it('rejects a field the shape does not declare', () => {
    // @ts-expect-error Action has no such field
    expectTypeOf<EntityShape<'Action'>['notAField']>().toBeUnknown();
  });

  it('reads an undeclared entity as base fields plus unknown values, never any', () => {
    expectTypeOf<EntityShape<'SomeFutureEntity'>>().toEqualTypeOf<BaseEntity & Record<string, unknown>>();
    expectTypeOf<EntityShape<'SomeFutureEntity'>['anything']>().toBeUnknown();
  });
});
