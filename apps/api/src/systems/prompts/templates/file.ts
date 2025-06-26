// <backend.ts>
//  ...
// </backend.ts>
import { PromptTemplate, registerPromptTemplate } from '../types';

// Legacy function for backward compatibility
export function file(filename: string, content: string) {
	return `
<${filename}>
${content}
</${filename}>
`;
}

// New prompt template definition
export const filePromptTemplate: PromptTemplate = {
  id: 'file-content',
  name: 'File Content',
  description: 'Wraps content in file tags for structured context',
  category: 'code',
  
  templateFn: (params) => {
    const { filename, content } = params;
    return `
<${filename}>
${content}
</${filename}>
`;
  },
  
  params: [
    {
      name: 'filename',
      description: 'The name of the file',
      type: 'string',
      required: true,
    },
    {
      name: 'content', 
      description: 'The content of the file',
      type: 'string',
      required: true,
    }
  ],
  
  example: {
    params: {
      filename: 'backend.ts',
      content: 'const server = express();'
    },
    output: `
<backend.ts>
const server = express();
</backend.ts>
`
  }
};

// Register the template
registerPromptTemplate(filePromptTemplate);

// ? when saving a prompt - save the template and (an AI generated) example
