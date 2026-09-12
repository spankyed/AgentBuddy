import * as path from 'path';
import '@/setup/sdk-host-init';
import { registerPack, getRegisteredEntityTypes } from '@abuddy/sdk/packs';
import { setCompiledDir } from '../src/__generated__/seeders';
import { registration } from '../src/__generated__/pack-entry';

setCompiledDir(path.resolve(__dirname, '..', 'dist'));

if (!getRegisteredEntityTypes().has('Action')) {
  registerPack(registration);
}
