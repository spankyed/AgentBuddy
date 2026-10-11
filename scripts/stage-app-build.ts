#!/usr/bin/env node
import { createBuildSession } from '../build/build-metadata.ts';
// Used by the release shell workflow before invoking the app bundlers.
console.log(createBuildSession());
