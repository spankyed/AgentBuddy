// <backend.ts>
//  ...
// </backend.ts>
export function file(filename: string, content: string) {
	return `
<${filename}>
${content}
</${filename}>
`;
}

// ? when saving a prompt - save the template and (an AI generated) example
