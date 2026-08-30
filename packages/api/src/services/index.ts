import { loggerService } from './logger';
import * as emitter from './event-emitter';
import { repositoryService } from './repository';
import { featureServices } from '@/registries/services';

const services = {
  logger: loggerService,
  emitter,
  repository: repositoryService,
  ...featureServices,
}

export default services;
