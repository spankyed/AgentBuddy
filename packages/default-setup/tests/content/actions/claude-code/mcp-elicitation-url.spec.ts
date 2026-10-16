import {describe,it,expect} from 'vitest';
import {mcpElicitationUrl} from '../../../../src/content/actions/claude-code/_helpers/mcp-elicitation.ts';
describe('explicit MCP URL navigation',()=>{
 it.each(['https://example.invalid/path?q=1#section','http://127.0.0.1:1234/fixture','https://example.invalid/path@value'])('retains the displayed URL exactly: %s',url=>expect(mcpElicitationUrl(url)).toBe(url));
 it.each(['javascript:alert(1)','data:text/html,fixture','file:///tmp/fixture','https://user:secret@example.invalid','https://example.invalid\\path','https://example.invalid/\nfixture','https://example.invalid/\u0000fixture',' https://example.invalid','https:///fixture','https://example.invalid/'+ 'x'.repeat(8192),null,{}])('rejects non-http, credentialed or ambiguous navigation: %s',url=>expect(mcpElicitationUrl(url)).toBeUndefined());
});
