import type { Rows } from '@/shared/types';
import { runAgentBrainFlow } from './run-agent-brain';
import { chatFlow } from './chat-flow';
import { someFlowWithValidation } from './some-flow-with-validation';
import { actionDemoFlow } from './action-demo-flow';
import { composeData } from '@/systems/_backend/mock-data';

export const flowRows: Rows = composeData([
  runAgentBrainFlow,
  chatFlow,
  someFlowWithValidation,
  actionDemoFlow,
]);
