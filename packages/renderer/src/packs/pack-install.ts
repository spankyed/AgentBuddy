import { sendToSystem } from '@abuddy/sdk/events';
import { HOST } from '@abuddy/host/fe';

export interface PackInstallRequest {
  packSlug: string;
  source?: string;
}

export function handleProtocolInstall(params: Record<string, string>): PackInstallRequest | null {
  const packSlug = params.pack;
  if (!packSlug) {
    console.warn('[pack-install] Missing pack parameter in install URL');
    return null;
  }

  return {
    packSlug,
    source: params.source,
  };
}

/** Asks the host's Packs system to install a pack; a send that fails is reported by the window's client */
export function requestPackInstall(request: PackInstallRequest): void {
  sendToSystem(HOST.packs, { type: 'INSTALL_PACK', packSlug: request.packSlug, source: request.source });
}
