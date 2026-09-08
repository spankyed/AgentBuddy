import '@/setup/sdk-host-init';
import { registerPack, getRegisteredEntityTypes } from '@/core/packs/pack-registration';
import { registration } from '../src/__generated__/pack-entry';

if (!getRegisteredEntityTypes().has('Action')) {
  registerPack(registration);
}
