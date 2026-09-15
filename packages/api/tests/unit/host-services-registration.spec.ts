// The API's host init registers the services packs reach through `services` only through @abuddy/host's
// registerHostServices, so their implementations stay in @abuddy/host/services
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const hostInit = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'setup', 'sdk-host-init.ts'), 'utf-8');

describe('API host init', () => {
  it('registers host-implemented services through registerHostServices', () => {
    expect(hostInit).toMatch(/import \{ registerHostServices \} from '@abuddy\/host\/services';/);
    expect(hostInit).toMatch(/^registerHostServices\(\);$/m);
  });

  it("doesn't register a service module itself", () => {
    expect(hostInit).not.toMatch(/registerHostModule\(\s*['"](app-data|trace-store|inference)['"]/);
  });

  it('keeps no service implementations of its own', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src', 'core', 'inference'))).toBe(false);
  });
});
