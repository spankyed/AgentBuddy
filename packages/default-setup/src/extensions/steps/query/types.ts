import type { NodeBase } from '@apack/sdk';
import type { DSLNodeBase } from '@apack/sdk/build';
import type { ModelId } from '@apack/sdk/models';

export interface DSLQueryNode extends DSLNodeBase {
  type: 'query';
  /** The request in natural language; the model turns it into a read-only EARS query */
  prompt: string;
  /** The result key the query's return value is stored under (default `rows`); `query` holds the generated query */
  as?: string;
  /** The model that writes the query (`provider:model`, default the llm step's) */
  model?: ModelId;
}

export interface QueryNode extends NodeBase {
  nodeType: 'query';
  prompt: string;
  resultKey?: string;
  model?: ModelId;
}
