import { expect, it } from 'vitest';
import { compareVersions } from '../../src/utils/compare-versions.ts';

it.each([
  ['1.0.0+first', '1.0.0+second', 0],
  ['1.0.0', '1.0.0+build.1', 0],
  ['1.0.0-alpha+first', '1.0.0-alpha+second', 0],
  ['1.0.0-alpha.1+build.2', '1.0.0-alpha.2+build.1', -1],
  ['1.0.1+build.1', '1.0.0+build.2', 1],
])('compares SemVer precedence independently of build metadata: %s, %s', (a, b, expected) => {
  expect(Math.sign(compareVersions(a, b))).toBe(expected);
});
