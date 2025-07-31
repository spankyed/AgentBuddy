import { createApp } from 'vue';
import App from './app.vue';
import { createActor } from 'xstate';
import { application, createApplicationState } from './core/actors/application';
import plugins, { defaultPlugin } from './plugins';
import logErrors from '@/core/log-errors';
import './style.css';

// Wait for backend port from Electron
async function initializeApp() {
  // Get backend port from Electron IPC
  let backendPort = 3001; // Default fallback
  
  if (window.electronAPI) {
    try {
      // Try to get the port immediately
      const port = await window.electronAPI.getBackendPort();
      if (port) {
        backendPort = port;
      }
      
      // Also listen for port updates
      window.electronAPI.onBackendPort((port) => {
        if (port && port !== backendPort) {
          // Port changed, might need to reconnect
          console.log('Backend port updated:', port);
          window.location.reload(); // Simple approach: reload to reconnect
        }
      });
    } catch (error) {
      console.warn('Failed to get backend port from Electron:', error);
    }
  }

  // Store backend URL globally for tRPC client
  (window as any).__BACKEND_URL__ = `ws://localhost:${backendPort}`;

  // Create and start the application actor
  const applicationActor = createActor(createApplicationState(), {
    systemId: application,
    input: {
      defaultPlugin,
      plugins,
    }
  }).start();

  applicationActor.subscribe(logErrors('Application'));

  // Store globally for debugging
  (window as any).applicationState = applicationActor;

  // Create Vue app
  const app = createApp(App);

  // Mount the app
  app.mount('#root');
}

// Initialize the app
initializeApp().catch(console.error);