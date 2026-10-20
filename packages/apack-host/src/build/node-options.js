/** NODE_OPTIONS uses spaces and double quotes, rather than shell tokenization. */
export function parseNodeOptions(value = '') {
  const args = [];
  let quoted = false;
  let argument;
  for (let index = 0; index < value.length; index++) {
    let character = value[index];
    if (character === '\\' && quoted) {
      if (++index === value.length) throw new Error('Invalid NODE_OPTIONS: invalid escape');
      character = value[index];
    } else if (character === '"') {
      quoted = !quoted;
      continue;
    } else if (character === ' ' && !quoted) {
      if (argument !== undefined) args.push(argument);
      argument = undefined;
      continue;
    }
    argument = (argument ?? '') + character;
  }
  if (quoted) throw new Error('Invalid NODE_OPTIONS: unterminated string');
  if (argument !== undefined) args.push(argument);
  return args;
}

/** Escape only what Node interprets inside a quoted argument; preserve all other bytes. */
export function formatNodeOptions(args) {
  return args.map(option => /[ "\\]/.test(option)
    ? `"${option.replace(/["\\]/g, '\\$&')}"` : option).join(' ');
}
