import type { DSLNodeBase, DSLStepNode } from '@abuddy/sdk/build';
import type { NodeBase } from '@abuddy/sdk/build';
import { BinaryOperator } from '@abuddy/sdk/utils';

export { BinaryOperator } from '@abuddy/sdk/utils';

export type Predicate = {
  key: string;
  operator: BinaryOperator;
  value?: any;
} | ((context: any) => boolean);

export type Condition = {
  predicate?: Predicate;
  label?: string;
  mode?: 'expression' | 'code';
  code?: string;
};

export interface DSLSwitchCondition {
  if: string;
  steps: DSLStepNode[];
}

export type DSLSwitchElse = DSLStepNode[];

export interface DSLSwitchNode extends DSLNodeBase {
  type: 'switch';
  conditions: DSLSwitchCondition[];
  else?: DSLSwitchElse;
}

export interface SwitchNode extends NodeBase {
  nodeType: 'switch';
  conditions: Array<Condition>;
  elseLabel?: string;
}
