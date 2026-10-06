// @slow: two TypeScript programs and six language-service queries, over two real `abuddy build`s
// Its subject is whether a generated facade *resolves and completes*, which only a compiler can answer, so
// the fixture builds a dependency and a dependent for real and the completion cases query a language
// service over the result: measured 2026-10-06, the two typechecks are 2.0s and 1.8s and six completion
// queries ~0.5s apiece, over a `beforeAll` that runs two `abuddy build`s.
//
// This file is the **workspace source** layout; `facade-typing-published.integration.spec.ts` is the same
// suite against the npm-packed packages, which is the seam a pack author meets. They are two files because
// the pool was floor-bound on the one that held both, and layout is the axis that splits them without
// running the fixture twice — `_support/facade-packs.ts` has the measurements and the suite itself.
import { facadeSuite } from '../_support/facade-packs';

facadeSuite('workspace source', false);
