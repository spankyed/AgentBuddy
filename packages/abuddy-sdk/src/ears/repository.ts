import { getHostModule } from '../runtime/host';

type AnyFn = (...args: any[]) => any;

let _repositoryMod: any;
function repoMod() {
  if (!_repositoryMod) _repositoryMod = getHostModule('repository');
  return _repositoryMod;
}

export const repository: any = new Proxy({} as any, {
  get(_, prop: string) {
    return repoMod().repository[prop];
  },
});

export function registerRepository(...args: any[]) {
  return repoMod().registerRepository(...args);
}

let _sharedRepoMod: any;
function sharedRepo() {
  if (!_sharedRepoMod) _sharedRepoMod = getHostModule('shared-repository');
  return _sharedRepoMod;
}

export function findById(...args: any[]) { return sharedRepo().findById(...args); }
export function findByIdRaw(...args: any[]) { return sharedRepo().findByIdRaw(...args); }
export function findAll(...args: any[]) { return sharedRepo().findAll(...args); }
export function findWhere(...args: any[]) { return sharedRepo().findWhere(...args); }
export function hasIdCollision(...args: any[]) { return sharedRepo().hasIdCollision(...args); }
export function createEntityWithDefaults(...args: any[]) { return sharedRepo().createEntityWithDefaults(...args); }
export function updateEntity(...args: any[]) { return sharedRepo().updateEntity(...args); }
export function exists(...args: any[]) { return sharedRepo().exists(...args); }
export function createRelation(...args: any[]) { return sharedRepo().createRelation(...args); }

export const RepositoryError: any = new Proxy(function () {} as any, {
  construct(_, args) { return new (sharedRepo().RepositoryError)(...args); },
  get(_, prop) { return sharedRepo().RepositoryError[prop]; },
});
export const RepositoryErrorCode: any = new Proxy({} as any, {
  get(_, prop: string) { return sharedRepo().RepositoryErrorCode[prop]; },
});

let _queryHelpers: any;
function queryHelpersM() {
  if (!_queryHelpers) _queryHelpers = getHostModule('query-helpers');
  return _queryHelpers;
}
export const queryHelpers = {
  findById: (...args: any[]) => queryHelpersM().findById(...args),
  findWhere: (...args: any[]) => queryHelpersM().findWhere(...args),
  findAll: (...args: any[]) => queryHelpersM().findAll(...args),
};

let _txHelpers: any;
function txHelpersM() {
  if (!_txHelpers) _txHelpers = getHostModule('transaction-helpers');
  return _txHelpers;
}
export const transactionHelpers = new Proxy({} as any, {
  get(_, prop: string) { return txHelpersM()[prop]; },
});
