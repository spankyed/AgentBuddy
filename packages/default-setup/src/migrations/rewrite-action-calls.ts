/**
 * Rewrites the calls a 0.3.14 action made to services that 0.3.15 changed, in the action's code as stored:
 * - a feature named by its bare id (`services.emitter.sendToPlugin('threads', …)`, `getPluginSettings('code')`)
 *   is named by its ref (`'default-setup/threads'`), and the app's own plugin `'application'` is `'host/application'`
 * - `services.emitter.sendToBrainSystem(event)` is `services.emitter.sendToSystem({ role: 'brain' }, { type:
 *   'TRIGGER_BRAIN_EVENT', ...event })`
 * - onboarding is the app's: `services.settings.getInternalSettings()` reads `services.appData.hasOnboarded()`, and
 *   `services.settings.updateInternalSetting(['hasOnboarded'], true)` is `services.appData.completeOnboarding()`
 *
 * Only these exact forms are rewritten: anything else is the user's code, left as they wrote it.
 */
export function rewriteActionCalls(code: string, options: { packId: string; bareIds: readonly string[] }): string {
  const bareIds = new Set(options.bareIds);

  const named = code.replace(
    /(services\s*\.\s*(?:emitter\s*\.\s*(sendToPlugin|sendToSystem)|settings\s*\.\s*updatePluginSetting|repository\s*\.\s*settingsQueries\s*\.\s*getPluginSettings)\s*\(\s*)(['"`])([A-Za-z0-9]+)\3/g,
    (call, head: string, send: string | undefined, quote: string, name: string) => {
      if (bareIds.has(name)) return `${head}${quote}${options.packId}/${name}${quote}`;
      if (name === 'application' && send === 'sendToPlugin') return `${head}${quote}host/application${quote}`;
      return call;
    },
  );

  const onboarding = named
    .replace(/services\s*\.\s*settings\s*\.\s*getInternalSettings\s*\(\s*\)/g, '({ hasOnboarded: services.appData.hasOnboarded() })')
    .replace(
      /services\s*\.\s*settings\s*\.\s*updateInternalSetting\s*\(\s*\[\s*(['"`])hasOnboarded\1\s*\]\s*,\s*true\s*\)/g,
      'services.appData.completeOnboarding()',
    );

  return rewriteBrainSends(onboarding);
}

const BRAIN_SEND = /services\s*\.\s*emitter\s*\.\s*sendToBrainSystem\s*\(/g;

/** Each `sendToBrainSystem(event)` whose closing parenthesis can be found, as the send to the brain's role */
function rewriteBrainSends(code: string): string {
  let out = '';
  let from = 0;
  for (const match of code.matchAll(BRAIN_SEND)) {
    const open = match.index + match[0].length;
    if (open <= from) continue;
    const close = closingParen(code, open);
    if (close === undefined) continue;
    const event = code.slice(open, close).trim();
    out += code.slice(from, match.index) + `services.emitter.sendToSystem({ role: 'brain' }, { type: 'TRIGGER_BRAIN_EVENT', ...(${event}) })`;
    from = close + 1;
  }
  return out + code.slice(from);
}

/**
 * The index of the `)` closing the parenthesis opened just before `start`, skipping strings, template literals
 * (and the expressions inside them) and comments; undefined when there is none.
 */
function closingParen(code: string, start: number): number | undefined {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      if (end === -1) return undefined;
      i = end + 1;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) return undefined;
      i = end + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const end = endOfString(code, i);
      if (end === undefined) return undefined;
      i = end + 1;
    } else {
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') {
        if (depth === 0) return c === ')' ? i : undefined;
        depth--;
      }
      i++;
    }
  }
  return undefined;
}

/** The index of the quote closing the string or template literal that opens at `start` */
function endOfString(code: string, start: number): number | undefined {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') i += 2;
    else if (c === quote) return i;
    else if (quote === '`' && c === '$' && code[i + 1] === '{') {
      // `${` opens an expression that ends at its matching `}`
      const end = closingBrace(code, i + 2);
      if (end === undefined) return undefined;
      i = end + 1;
    } else i++;
  }
  return undefined;
}

function closingBrace(code: string, start: number): number | undefined {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = endOfString(code, i);
      if (end === undefined) return undefined;
      i = end + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) return i;
      depth--;
    }
    i++;
  }
  return undefined;
}
