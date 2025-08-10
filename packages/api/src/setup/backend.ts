import { createActor } from 'xstate';
import { logErrors } from '@/core/utils/actor-helpers';
import { logsSystem } from '@/systems/logs/system';
import { backendSystem, bus } from '@/systems/backend';
import { initializeLogCapture } from '@/core/utils/debug/log-capture';
import { loadSnapshot } from '@/core/data';

export async function setupBackend(): Promise<void> {
  // Load data snapshot
  await loadSnapshot();
  
  // Initialize log capture
  initializeLogCapture();
  
  // Start logs actor
  const logsActor = createActor(logsSystem).start();
  logsActor.subscribe(logErrors('Logs'));
  
  // Start backend actor
  const backendActor = createActor(backendSystem, {
    systemId: bus,
  }).start();
  
  backendActor.subscribe(logErrors('Backend'));
}