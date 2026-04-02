import type { ButtonConfig, LinkConfig } from '../../defs/default-setup-defs';

export function buildButtonsWithDeploymentState(deploymentState: string): ButtonConfig[] {
  return [
    {
      id: 'debug-mode',
      label: 'Debug Mode',
      state: 'off',
      toggleStates: {
        off: { label: 'Enable Debug Mode', variant: 'secondary' },
        on: { label: 'Disable Debug Mode', variant: 'success' }
      }
    },
    {
      id: 'auto-save',
      label: 'Auto Save',
      state: 'on',
      toggleStates: {
        on: { label: 'Auto Save: ON', variant: 'success' },
        off: { label: 'Auto Save: OFF', variant: 'danger' }
      }
    },
    {
      id: 'deployment',
      label: 'Deployment',
      state: deploymentState,
      states: {
        ready: { label: 'Deploy to Production', variant: 'primary' },
        deploying: { label: 'Deploying...', variant: 'secondary', disabled: true },
        deployed: { label: 'Deployed Successfully', variant: 'success' },
        failed: { label: 'Deployment Failed', variant: 'danger' }
      }
    }
  ];
}

export function buildMockLinks(threadId: string): LinkConfig[] {
  return [
    {
      label: 'View Project Plan',
      event: {
        target: 'agent',
        data: {
          type: 'SELECT_ARTIFACT',
          artifactId: 'placeholder'
        }
      },
      icon: 'file-text'
    },
    {
      label: 'Open Birth Thread',
      event: {
        target: 'agent',
        data: {
          type: 'OPEN_THREAD_CHAT',
          threadId: threadId
        }
      },
      icon: 'message-square'
    },
    {
      label: 'Go to Threads',
      event: {
        target: 'application',
        data: {
          type: 'SELECT_PLUGIN',
          pluginId: 'threads'
        }
      },
      icon: 'settings'
    },
    {
      label: 'View Documentation',
      event: {
        target: 'external',
        data: {
          url: 'https://docs.example.com'
        }
      },
      icon: 'external-link'
    }
  ];
}

export function simulateDeployment(
  services: { chat: { updateMessageState: Function } },
  messageId: string,
  buildButtons: (state: string) => any[],
) {
  setTimeout(() => {
    services.chat.updateMessageState(messageId, {
      blocks: [{
        type: 'button-group',
        props: {
          buttons: buildButtons('deploying'),
          keepInteractive: true,
          displayText: 'Action completed:'
        }
      }]
    });
  }, 2000);

  setTimeout(() => {
    services.chat.updateMessageState(messageId, {
      blocks: [{
        type: 'button-group',
        props: {
          buttons: buildButtons('deployed'),
          keepInteractive: true,
          displayText: 'Action completed:'
        }
      }]
    });
  }, 4000);
}
