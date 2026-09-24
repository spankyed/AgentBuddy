// An install asked for from outside the app: `abuddy://install?pack=<slug>&source=<url>`, which the platform hands
// the window as parameters. Reading them and asking the Packs system is the app's, so a window only subscribes to
// the protocol and passes on what it was given.
import { sendToSystem } from '../../../events.ts';
import { HOST } from '../../../refs.ts';

export interface PackInstallRequest {
  packSlug: string;
  source?: string;
}

/** The install a deep link's parameters ask for, or null when they name no pack */
export function packInstallRequest(params: Record<string, string>): PackInstallRequest | null {
  const packSlug = params.pack;
  if (!packSlug) {
    console.warn('[pack-install] Missing pack parameter in install URL');
    return null;
  }
  return { packSlug, source: params.source };
}

/** Asks the Packs system to install a pack; a send that fails is reported by the window's client */
export function requestPackInstall(request: PackInstallRequest): void {
  sendToSystem('packs', { type: 'INSTALL_PACK', packSlug: request.packSlug, source: request.source });
}

/** What a deep link asks for, installed: the one call a window makes when the platform hands it an install URL */
export function installFromProtocol(params: Record<string, string>): void {
  const request = packInstallRequest(params);
  if (request) requestPackInstall(request);
}
