// The SDK's own entities typed by their shapes, as a pack's #generated/ears types the pack's: the SDK's repositories
// and appliers read their rows through it, on the bound engine, rather than naming a row type nothing checks
import { defineEars } from '@apackdev/ears';
import type { SdkEntityShapes } from '../types/sdk-entities.ts';
import { boundEars } from './index.ts';

export const sdkEntities = /*#__PURE__*/ defineEars<SdkEntityShapes, keyof SdkEntityShapes>(boundEars);
