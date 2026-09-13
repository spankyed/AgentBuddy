import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import { emit, type PackEvents } from '@/__generated__/events';

// ─── PackEvents augmentation ──────────────────────────────────

describe('PackEvents — augmented keys', () => {
  it('registry includes all 12 plugin IDs', () => {
    type Keys = keyof PackEvents;
    expectTypeOf<'threads'>().toMatchTypeOf<Keys>();
    expectTypeOf<'code'>().toMatchTypeOf<Keys>();
    expectTypeOf<'settings'>().toMatchTypeOf<Keys>();
    expectTypeOf<'database'>().toMatchTypeOf<Keys>();
    expectTypeOf<'brain'>().toMatchTypeOf<Keys>();
    expectTypeOf<'flows'>().toMatchTypeOf<Keys>();
    expectTypeOf<'library'>().toMatchTypeOf<Keys>();
    expectTypeOf<'logs'>().toMatchTypeOf<Keys>();
    expectTypeOf<'notes'>().toMatchTypeOf<Keys>();
    expectTypeOf<'browser'>().toMatchTypeOf<Keys>();
    expectTypeOf<'prompts'>().toMatchTypeOf<Keys>();
    expectTypeOf<'actions'>().toMatchTypeOf<Keys>();
  });

  it('unregistered plugin is not a key', () => {
    type Keys = keyof PackEvents;
    expectTypeOf<'unknown-plugin'>().not.toMatchTypeOf<Keys>();
  });
});

// ─── PackEvents event shapes ──────────────────────────────────

describe('PackEvents — event shapes', () => {
  it('threads events include THREAD_CONNECTED', () => {
    type ThreadEvents = PackEvents['threads'];
    expectTypeOf<Extract<ThreadEvents, { type: 'THREAD_CONNECTED' }>>().not.toBeNever();
  });

  it('threads events include THREAD_CREATED', () => {
    type ThreadEvents = PackEvents['threads'];
    expectTypeOf<Extract<ThreadEvents, { type: 'THREAD_CREATED' }>>().not.toBeNever();
  });

  it('code events include CODE_CONNECTED', () => {
    type CodeEvents = PackEvents['code'];
    expectTypeOf<Extract<CodeEvents, { type: 'CODE_CONNECTED' }>>().not.toBeNever();
  });

  it('settings events include SETTINGS_LOADED', () => {
    type SettingsEvents = PackEvents['settings'];
    expectTypeOf<Extract<SettingsEvents, { type: 'SETTINGS_LOADED' }>>().not.toBeNever();
  });
});

// ─── Typed emit() overload ─────────────────────────────────────────────

describe('Typed emit() — constrained by PackEvents', () => {
  it('emit return type includes OUTGOING wrapper', () => {
    type EmitFn = typeof emit;
    expectTypeOf<ReturnType<EmitFn>>().toHaveProperty('type');
    expectTypeOf<ReturnType<EmitFn>>().toHaveProperty('event');
  });

  it('emit with unregistered plugin accepts any event via fallback overload', () => {
    const fallback: (id: string, event: { type: string }) => any = emit;
    expectTypeOf(fallback).toBeFunction();
  });

  it('emit constrained overload narrows event param for registered plugin', () => {
    type ThreadEvent = PackEvents['threads'];
    type EmitThreads = (pluginId: 'threads', event: ThreadEvent) => any;
    const typedEmit: EmitThreads = emit;
    expectTypeOf(typedEmit).toBeFunction();
  });
});

// ─── Extensibility ─────────────────────────────────────────────────────

describe('PackEvents — extensibility', () => {
  it('registry is open for declaration merging', () => {
    type Keys = keyof PackEvents;
    type HasThreads = 'threads' extends Keys ? true : false;
    expectTypeOf<HasThreads>().toEqualTypeOf<true>();
  });
});
