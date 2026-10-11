// escapeHtml makes text safe to put in HTML markup
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../src/utils/pure.ts';

describe('escapeHtml', () => {
  it('escapes every markup character', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & more`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; more');
  });

  it('leaves other text alone', () => {
    expect(escapeHtml('plain text, émojis 👋 and / slashes')).toBe('plain text, émojis 👋 and / slashes');
  });
});
