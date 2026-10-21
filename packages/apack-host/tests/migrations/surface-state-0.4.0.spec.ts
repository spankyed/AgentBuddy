// The 0.4.0 app migration: a database written before the rename reads back the same visibility map and
// last-active ref under the names AppState now has. Its subject is the data, so every case goes through
// `appState` after writing the old attributes raw — which is the only way to produce a pre-rename row,
// `update()` having no name for them any more.
import { beforeEach, expect, it } from 'vitest';
import { untypedQx, untypedTx, type EARS } from '@apackdev/ears';
import { resetTestData, startTestRuntime } from '@apackdev/sdk/testing';
import { APP_STATE_ENTITY, HOST_ENTITY_TYPES, appState } from '../../src/app-state/index.ts';
import { up } from '../../src/migrations/app/0.4.0.ts';

const APP_STATE_ID = `${APP_STATE_ENTITY}-app` as EARS.EntityId;

/** A row as a pre-rename app wrote it: the two old attributes, beside one the rename does not touch. */
function writtenBeforeTheRename(old: { pluginVisibility?: Record<string, boolean>; lastActivePlugin?: string }): void {
  const write = untypedTx(APP_STATE_ID, true).put('entityType', APP_STATE_ENTITY);
  write.update('hasOnboarded', true);
  for (const [kind, value] of Object.entries(old)) write.update(kind, value);
}

/** Whether the row still carries an attribute at all. The engine answers `null` for one it does not. */
const stillHas = (kind: string): boolean =>
  ((untypedQx(APP_STATE_ID).pickOne([kind]) as Record<string, unknown> | null)?.[kind] ?? null) !== null;

beforeEach(() => {
  startTestRuntime({ entityTypes: HOST_ENTITY_TYPES, appVersion: '0.4.0' });
  resetTestData();
});

it('reads back what the old attributes held, under the names AppState has now', () => {
  writtenBeforeTheRename({ pluginVisibility: { 'default-setup/notes': false }, lastActivePlugin: 'default-setup/code' });

  up();

  expect(appState.get().surfaceVisibility).toEqual({ 'default-setup/notes': false });
  expect(appState.get().lastActiveSurface).toBe('default-setup/code');
});

it('leaves nothing behind for anything to read the old way', () => {
  writtenBeforeTheRename({ pluginVisibility: { 'a/b': true }, lastActivePlugin: 'a/b' });

  up();

  expect(stillHas('pluginVisibility')).toBe(false);
  expect(stillHas('lastActivePlugin')).toBe(false);
});

/**
 * The two attributes are independent: a user who never opened a second surface has a visibility map and no
 * last-active ref, and a migration guarding on the row rather than on each attribute would write
 * `lastActiveSurface: undefined` for them.
 */
it('moves whichever of the two the row holds', () => {
  writtenBeforeTheRename({ pluginVisibility: { 'a/b': false } });

  up();

  expect(appState.get().surfaceVisibility).toEqual({ 'a/b': false });
  expect(appState.get().lastActiveSurface).toBeUndefined();
});

/** Development boots and each beta of the release run it again, so a second run must be a no-op. */
it('runs again over its own result without changing it', () => {
  writtenBeforeTheRename({ pluginVisibility: { 'a/b': true }, lastActivePlugin: 'a/b' });

  up();
  const after = appState.get();
  up();

  expect(appState.get()).toEqual(after);
});

it('does nothing to a row that never held them, or to no row at all', () => {
  up();
  expect(appState.exists()).toBe(false);

  appState.update({ hasOnboarded: true, surfaceVisibility: { 'a/b': true } });
  up();

  expect(appState.get().surfaceVisibility).toEqual({ 'a/b': true });
  expect(appState.get().hasOnboarded).toBe(true);
});
