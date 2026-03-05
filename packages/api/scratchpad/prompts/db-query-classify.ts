import type { PromptMeta } from '../types';

export const meta: PromptMeta = {
  label: 'db-query-classification',
  description: 'Classifies a database prompt as a query (read) or transaction (write) operation',
  category: 'database',
  inputs: {
    queryExamples: { name: 'queryExamples', type: 'string', required: true, description: 'Example read operations' },
    transactionExamples: { name: 'transactionExamples', type: 'string', required: true, description: 'Example write operations' },
    dbPrompt: { name: 'dbPrompt', type: 'string', required: true, description: 'The user message to classify' },
  },
  outputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['query', 'transaction'], description: 'Whether the message is a read or write operation' },
    },
  },
};

export function template(params: Record<string, any>) {
  return `Analyze the following message and determine if it's a query (read operation) or transaction (mutation/write operation):

    A query is any operation that reads or retrieves data without modifying it.
    A transaction is any operation that creates, updates, or deletes data.

    <queryExamples>
    ${params.queryExamples}
    </queryExamples>

    <transactionExamples>
    ${params.transactionExamples}
    </transactionExamples>

    Message: "${params.dbPrompt}"

    Please classify the message as either a query or a transaction.`;
}
