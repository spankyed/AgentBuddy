// Compile-time check, run by `tsc` (npm run typecheck:pack). The SDK's services and standard seeders
// call these repositories through the BuiltinRepositories contract; this fails when default-setup's
// repositories stop satisfying it (a method renamed, a parameter or return type changed).
import { describe, expect, it } from 'vitest';
import type { BuiltinRepositories } from '@abuddy/sdk/ears/internals';
import type { Repositories } from '@/__generated__/repository';

declare const repositories: Repositories;
// Type-level only: never called
const satisfiesContract = (): BuiltinRepositories => repositories;

describe('BuiltinRepositories', () => {
  it("is satisfied by default-setup's repositories", () => {
    expect(satisfiesContract).toBeTypeOf('function');
  });
});
