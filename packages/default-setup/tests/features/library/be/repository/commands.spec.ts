// Moving folders: a folder dropped into its own subtree, or onto itself, stays where it was — the move would make
// the folders a loop with no root — and the paths and breadcrumbs read from the tree run from the root down
import { beforeEach, expect, it } from 'vitest';
import { resetTestData } from '@apackdev/sdk/testing';
import { collectionPath, parentCollectionOf } from '@apackdev/sdk/repositories';
import type { EARS } from '#generated/ears.ts';
import { repository } from '#generated/repository.ts';

beforeEach(() => resetTestData());

const folder = (name: string, parentId?: EARS.EntityId) => repository.libraryCommands.createCollection(name, undefined, parentId).id as EARS.EntityId;

function tree() {
  const top = folder('top');
  const middle = folder('middle', top);
  const bottom = folder('bottom', middle);
  const other = folder('other');
  return { top, middle, bottom, other };
}

it('leaves a folder moved into its own subtree, or onto itself, where it was, and moves it anywhere else', () => {
  const { top, middle, bottom, other } = tree();

  repository.libraryCommands.moveItems([top], bottom);
  repository.libraryCommands.moveItems([middle], middle);
  expect([parentCollectionOf(top), parentCollectionOf(middle), parentCollectionOf(bottom)]).toEqual([null, top, middle]);

  repository.libraryCommands.moveItems([middle, top], other);
  expect([parentCollectionOf(middle), parentCollectionOf(top)]).toEqual([other, other]);
});

it("a folder's path and breadcrumbs run from the root down to it", () => {
  const { top, bottom } = tree();
  expect(collectionPath(bottom)).toEqual(['top', 'middle', 'bottom']);
  expect(repository.libraryQueries.getFolderPath(bottom).map((crumb) => crumb.name)).toEqual(['top', 'middle', 'bottom']);
  expect(repository.libraryQueries.getFolderPath(top).map((crumb) => crumb.id)).toEqual([top]);
});
