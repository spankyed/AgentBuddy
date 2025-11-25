export const analyzeDbQuery = ({
    selectedDoc,
}: { selectedDoc: string }) =>
`
<examples>
${selectedDoc}
</examples>

Use the provided examples to write the code to satisfy the user message. Only respond with code (no codeblock backticks).
` as const