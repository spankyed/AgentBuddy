// A popout window is made for a plugin id the renderer sends, which ends up in the popout's URL
import { describe, expect, it } from 'vitest';
import { isPluginId } from '../src/modules/window-manager/plugin-id.js';

describe('isPluginId', () => {
  it("takes a pack's plugin and a host plugin", () => {
    expect(isPluginId('default-setup/notes')).toBe(true);
    expect(isPluginId('packs')).toBe(true);
  });

  it('refuses anything else', () => {
    for (const id of ['', 'a/b/c', '/notes', 'notes/', '../x', 'a b', 'default-setup/notes?x=1']) {
      expect(isPluginId(id), id).toBe(false);
    }
  });
});
