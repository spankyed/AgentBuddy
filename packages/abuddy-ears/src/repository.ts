import { installedEngine } from './installed.ts';

const notRegistered = (name: string) => new Error(
  `[repository] "${name}" is not registered. Ensure the owning system's repository module is imported before access.`
);

/** An engine's repository registry */
export function createRepositoryRegistry() {
  const entries: Record<string, unknown> = {};

  function registerRepository(name: string, value: unknown): void {
    entries[name] = value;
  }

  const repository: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (typeof prop === 'symbol') return undefined;
      const value = entries[prop];
      if (value === undefined) throw notRegistered(prop);
      return value;
    },
  });

  return { repository, registerRepository, entries: () => ({ ...entries }) };
}

/** Registers a repository under a name. Packs declare theirs in abuddy.json (`features[].repositories`). */
export function registerRepository(name: string, value: unknown): void {
  installedEngine().registerRepository(name, value);
}

/**
 * Every registered repository, for host code. Packs use the `repository` from their
 * `#generated/repository`, typed with their own and their dependencies' repositories.
 */
export const repository: Record<string, unknown> = /*#__PURE__*/ new Proxy({} as Record<string, unknown>, {
  get(_, prop) {
    if (typeof prop === 'symbol') return undefined;
    return installedEngine().repository[prop];
  },
});

export type Repository = typeof repository;

export {
  countEntities, exists, hasIdCollision,
} from './query-helpers.ts';

export {
  prepareEntity,
  createRelation as repoCreateRelation, removeRelation as repoRemoveRelation,
} from './transaction-helpers.ts';

export { RepositoryError, RepositoryErrorCode } from './repository-errors.ts';
