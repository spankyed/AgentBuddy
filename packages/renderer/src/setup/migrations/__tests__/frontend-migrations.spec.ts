import { beforeEach, describe, expect, it } from 'vitest';
import { runFrontendMigrations } from '../index';

describe('frontend migrations', () => {
  beforeEach(() => localStorage.clear());

  // The host keeps the last active plugin now; the window's own copy would linger forever
  it("drops the last active plugin a window stored before 0.3.15, and leaves the panel sizes", () => {
    localStorage.setItem('agentbuddy-fe-version', '0.3.14');
    localStorage.setItem('agentbuddy-last-active-plugin', 'threads');
    localStorage.setItem('agentbuddy-panel-sizes', '{"panel":30}');

    runFrontendMigrations();
    runFrontendMigrations();

    expect(localStorage.getItem('agentbuddy-last-active-plugin')).toBeNull();
    expect(localStorage.getItem('agentbuddy-panel-sizes')).toBe('{"panel":30}');
  });
});
