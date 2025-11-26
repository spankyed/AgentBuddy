export const analyzeDbQuery = ({
    queryExamples,
    transactionExamples,
    dbPrompt
}: { queryExamples: string; transactionExamples: string; dbPrompt: string }) =>
`Analyze the following message and determine if it's a query (read operation) or transaction (mutation/write operation):

    A query is any operation that reads or retrieves data without modifying it.
    A transaction is any operation that creates, updates, or deletes data.

    <queryExamples>
    ${queryExamples}
    </queryExamples>

    <transactionExamples>
    ${transactionExamples}
    </transactionExamples>

    Message: "${dbPrompt}"

    Please classify the message as either a query or a transaction.
` as const