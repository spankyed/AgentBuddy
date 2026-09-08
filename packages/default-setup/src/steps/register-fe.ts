import { stepRegistry } from '@abuddy/sdk/steps';
import { standardSteps } from './register';

for (const step of standardSteps) stepRegistry.register(step);
