import { createInspectLogger } from '@abuddy/sdk/logger';

const inspectLogger = createInspectLogger('brain');

export const brainInspect = inspectLogger.inspect;
export const setBrainInspectEnabled = inspectLogger.setEnabled;
export const isBrainInspectEnabled = inspectLogger.isEnabled;
export const brainLogger = inspectLogger.logger;
