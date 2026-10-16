import { expect, it } from 'vitest';
import { parseCommandArguments } from '../../../../src/content/actions/claude-code/_helpers/command-arguments.ts';
it.each([
 ['add-json fixture \'{"command":"path with space","args":["a b"]}\'', ['add-json','fixture','{"command":"path with space","args":["a b"]}']],
 ['--cwd "project with spaces"', ['--cwd','project with spaces']],
 ['"" \'\' tail', ['', '', 'tail']],
 ['pre"middle space"post', ['premiddle spacepost']],
 ['a\\ b', ['a b']],
 ['"a\\q"', ['a\\q']],
 ['"a\\"b"', ['a"b']],
 ["'a'\\''b'", ["a'b"]],
 ['$HOME $(fixture) `fixture` ; | *', ['$HOME','$(fixture)','`fixture`',';','|','*']],
 ['first\\\nsecond', ['firstsecond']],
 ['  \t\n', []],
] as Array<[string,string[]]>)('preserves literal argv for %s', (input, expected) => expect(parseCommandArguments(input)).toEqual(expected));
it.each(["'unfinished", '"unfinished', 'unfinished\\', 'nul\0argument'])('rejects invalid command input %s', input => expect(() => parseCommandArguments(input)).toThrow());
