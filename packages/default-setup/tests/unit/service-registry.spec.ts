import { describe, it, expectTypeOf } from 'vitest';
import type { ServiceRegistry } from '@abuddy/sdk/types';
import '@/registries/service-types';

describe('ServiceRegistry — augmented types', () => {
  it('registry has llm service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('llm');
  });

  it('registry has prompt service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('prompt');
  });

  it('registry has database service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('database');
  });

  it('registry has settings service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('settings');
  });

  it('registry has browser service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('browser');
  });

  it('registry has threads service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('threads');
  });

  it('registry has cli service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('cli');
  });

  it('registry has modelClient service', () => {
    expectTypeOf<ServiceRegistry>().toHaveProperty('modelClient');
  });

  it('keyof includes all registered service names', () => {
    type Keys = keyof ServiceRegistry;
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
