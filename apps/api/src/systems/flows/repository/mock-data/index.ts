import type { Rows } from '@/shared/types';
import { runAgentBrainFlow } from './flows/run-agent-brain';
import { chatFlow } from './flows/chat-flow';
import { someFlowWithValidation } from './flows/some-flow-with-validation';

// Combine all flow data
export const flowRows: Rows = {
  entity: [
    ...runAgentBrainFlow.entity,
    ...chatFlow.entity,
    ...someFlowWithValidation.entity,
  ],
  
  role: [
    ...runAgentBrainFlow.role,
    ...chatFlow.role,
    ...someFlowWithValidation.role,
  ],
  
  relation: [
    ...runAgentBrainFlow.relation,
    ...chatFlow.relation,
    ...someFlowWithValidation.relation,
  ],
};
