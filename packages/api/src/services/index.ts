import { loggerService } from './logger';
import * as emitter from './event-emitter';
import { repositoryService } from './repository';
import { getRegisteredServices } from '@/core/packs/pack-registration';

const hostServices = {
  logger: loggerService,
  emitter,
  repository: repositoryService,
};

function getServices(): Record<string, unknown> {
  return {
    ...hostServices,
    ...getRegisteredServices(),
  };
}

export default new Proxy({} as Record<string, unknown>, {
  get(_, prop: string | symbol) {
    return getServices()[prop as string];
  },
  ownKeys() {
    return Reflect.ownKeys(getServices());
  },
  getOwnPropertyDescriptor(_, prop) {
    const s = getServices();
    if (prop in s) {
      return { configurable: true, enumerable: true, value: (s as any)[prop] };
    }
    return undefined;
  },
});
