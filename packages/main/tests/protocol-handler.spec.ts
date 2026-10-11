import {EventEmitter} from 'node:events';
import {beforeEach, expect, it, vi} from 'vitest';
import type {ModuleContext} from '../src/ModuleContext.ts';

const fixture = vi.hoisted(() => ({
  context: {build: 'test', urlScheme: 'apack'},
  send: vi.fn(),
}));

vi.mock('../src/app-context.ts', () => ({getAppContext: () => fixture.context}));
vi.mock('electron', () => ({BrowserWindow: {
  getAllWindows: () => [{isDestroyed: () => false, isMinimized: () => false,
    focus: () => {}, webContents: {send: fixture.send}}],
}}));

import {createProtocolHandler} from '../src/modules/ProtocolHandler.ts';

beforeEach(() => {
  fixture.context.build = 'test';
  fixture.send.mockClear();
});

it('receives install links in an isolated test without claiming the system protocol', () => {
  const app = Object.assign(new EventEmitter(), {setAsDefaultProtocolClient: vi.fn()});
  createProtocolHandler().enable({app} as unknown as ModuleContext);
  expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
  const preventDefault = vi.fn();
  app.emit('open-url', {preventDefault}, 'apack://install?pack=fixture%2Fpack%40v1.0.0');
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(fixture.send).toHaveBeenCalledWith('protocol-action', {
    action: 'install', params: {pack: 'fixture/pack@v1.0.0'},
  });
});

it('registers the protocol for ordinary app builds', () => {
  fixture.context.build = 'production';
  const app = Object.assign(new EventEmitter(), {setAsDefaultProtocolClient: vi.fn()});
  createProtocolHandler().enable({app} as unknown as ModuleContext);
  expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('apack');
});
