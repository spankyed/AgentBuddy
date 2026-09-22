import { trpc } from '@/core/trpc';
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

export async function requestPackInstall(request: PackInstallRequest): Promise<void> {
  try {
    await trpc.bus.send.mutate({
      to: HOST.packs,
      event: { type: 'INSTALL_PACK', packSlug: request.packSlug, source: request.source },
    });
  } catch (err) {
    console.error('[pack-install] Failed to send install request:', err);
  }
}
