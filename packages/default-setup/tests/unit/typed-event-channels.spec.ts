import { describe, it } from 'vitest';
import { expectTypeOf } from 'vitest';
import type { PluginEventRegistry } from '@abuddy/sdk/types';
import { emit } from '@abuddy/sdk/helpers';
import '@/__generated__/event-channels';

// ─── PluginEventRegistry augmentation ──────────────────────────────────

describe('PluginEventRegistry — augmented keys', () => {
  it('registry includes all 12 plugin IDs', () => {
    type Keys = keyof PluginEventRegistry;
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
    type Keys = keyof PluginEventRegistry;
    expectTypeOf<'unknown-plugin'>().not.toMatchTypeOf<Keys>();
  });
});

// ─── PluginEventRegistry event shapes ──────────────────────────────────

describe('PluginEventRegistry — event shapes', () => {
  it('threads events include THREAD_CONNECTED', () => {
    type ThreadEvents = PluginEventRegistry['threads'];
    expectTypeOf<Extract<ThreadEvents, { type: 'THREAD_CONNECTED' }>>().not.toBeNever();
  });

  it('threads events include THREAD_CREATED', () => {
    type ThreadEvents = PluginEventRegistry['threads'];
    expectTypeOf<Extract<ThreadEvents, { type: 'THREAD_CREATED' }>>().not.toBeNever();
  });

  it('code events include CODE_CONNECTED', () => {
    type CodeEvents = PluginEventRegistry['code'];
    expectTypeOf<Extract<CodeEvents, { type: 'CODE_CONNECTED' }>>().not.toBeNever();
  });

  it('settings events include SETTINGS_LOADED', () => {
    type SettingsEvents = PluginEventRegistry['settings'];
    expectTypeOf<Extract<SettingsEvents, { type: 'SETTINGS_LOADED' }>>().not.toBeNever();
  });
});

// ─── Typed emit() overload ─────────────────────────────────────────────

describe('Typed emit() — constrained by PluginEventRegistry', () => {
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
    type ThreadEvent = PluginEventRegistry['threads'];
    type EmitThreads = (pluginId: 'threads', event: ThreadEvent) => any;
    const typedEmit: EmitThreads = emit;
    expectTypeOf(typedEmit).toBeFunction();
  });
});

// ─── Extensibility ─────────────────────────────────────────────────────

describe('PluginEventRegistry — extensibility', () => {
  it('registry is open for declaration merging', () => {
    type Keys = keyof PluginEventRegistry;
    type HasThreads = 'threads' extends Keys ? true : false;
    expectTypeOf<HasThreads>().toEqualTypeOf<true>();
  });
});
