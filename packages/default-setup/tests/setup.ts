import '@/setup/sdk-host-init';
import { registerPack, getRegisteredEntityTypes } from '@abuddy/sdk/packs';
import { registration } from '../src/__generated__/pack-entry';

if (!getRegisteredEntityTypes().has('Action')) {
  registerPack(registration);
}
