import { describe, it, expectTypeOf } from 'vitest';
import type { Services } from '@/__generated__/services';

describe('Services — augmented types', () => {
  it('registry has llm service', () => {
    expectTypeOf<Services>().toHaveProperty('llm');
  });

  it('registry has prompt service', () => {
    expectTypeOf<Services>().toHaveProperty('prompt');
  });

  it('registry has database service', () => {
    expectTypeOf<Services>().toHaveProperty('database');
  });

  it('registry has settings service', () => {
    expectTypeOf<Services>().toHaveProperty('settings');
  });

  it('registry has browser service', () => {
    expectTypeOf<Services>().toHaveProperty('browser');
  });

  it('registry has threads service', () => {
    expectTypeOf<Services>().toHaveProperty('threads');
  });

  it('registry has cli service', () => {
    expectTypeOf<Services>().toHaveProperty('cli');
  });

  it('registry has modelClient service', () => {
    expectTypeOf<Services>().toHaveProperty('modelClient');
  });

  it('keyof includes all registered service names', () => {
    type Keys = keyof Services;
    expectTypeOf<'llm'>().toMatchTypeOf<Keys>();
    expectTypeOf<'database'>().toMatchTypeOf<Keys>();
    expectTypeOf<'prompt'>().toMatchTypeOf<Keys>();
    expectTypeOf<'action'>().toMatchTypeOf<Keys>();
    expectTypeOf<'library'>().toMatchTypeOf<Keys>();
    expectTypeOf<'browser'>().toMatchTypeOf<Keys>();
    expectTypeOf<'settings'>().toMatchTypeOf<Keys>();
    expectTypeOf<'chat'>().toMatchTypeOf<Keys>();
    expectTypeOf<'artifact'>().toMatchTypeOf<Keys>();
    expectTypeOf<'brain'>().toMatchTypeOf<Keys>();
    expectTypeOf<'cli'>().toMatchTypeOf<Keys>();
    expectTypeOf<'filesystem'>().toMatchTypeOf<Keys>();
    expectTypeOf<'threads'>().toMatchTypeOf<Keys>();
    expectTypeOf<'codex'>().toMatchTypeOf<Keys>();
    expectTypeOf<'modelClient'>().toMatchTypeOf<Keys>();
    expectTypeOf<'openaiAuth'>().toMatchTypeOf<Keys>();
    expectTypeOf<'textStream'>().toMatchTypeOf<Keys>();
  });
});
