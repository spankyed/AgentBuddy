/**
 * Default-Setup FE Pack Entry
 *
 * Single entry point for everything default-setup contributes to the
 * renderer: plugins, tiptap extensions, and app extensions.
 * FE counterpart to pack-entry.ts (backend).
 */

import { plugins, defaultPlugin } from './registries/plugins';
import './registries/tiptap-register-fe';
import './registries/app-extensions';

export { plugins, defaultPlugin };
