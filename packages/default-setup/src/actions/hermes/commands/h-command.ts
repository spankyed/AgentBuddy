/**
 * Hermes Command Router — handles all /h-* slash commands.
 *
 * Routes commands to the appropriate Hermes bridge method and posts
 * results to the thread. Supports: approve, deny, compact, undo, retry,
 * model, tools, memory, persona, skills, status.
 */

import type { ActionMeta, Services, Z } from '../../../types';
import { getHermesState } from '../_helpers/thread-context';

export const meta: ActionMeta = {
  label: 'Hermes Command',
  description: 'Routes /h-* slash commands to the Hermes bridge.',
  category: 'hermes',
  input: {
    command: { type: 'string', description: 'Command name (without /h- prefix)', required: true },
    text: { type: 'string', description: 'Command arguments', required: false },
    threadId: { type: 'string', description: 'Thread for feedback', required: false },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { command, text, threadId } = params;
  const hermes = (services as any).hermes;
  const reply = (msg: string) => {
    if (!threadId) return;
    services.chat.sendBlockMessage({ threadId: threadId as any, text: msg, blocks: [], forkable: false });
  };

  const sessionId = threadId ? getHermesState(services, threadId)?.sessionId : undefined;

  try {
    switch (command) {
      case 'h-approve':
        reply('Approved. Sending /approve to agent\u2026');
        await hermes.chat({ message: '/approve', sessionId }, () => {});
        break;

      case 'h-deny':
        reply('Denied. Sending /deny to agent\u2026');
        await hermes.chat({ message: '/deny', sessionId }, () => {});
        break;

      case 'h-compact':
        reply('Compacting context\u2026');
        await hermes.chat({ message: `/compact ${text || ''}`.trim(), sessionId }, () => {});
        break;

      case 'h-undo':
        reply('Undoing last message\u2026');
        await hermes.chat({ message: '/undo', sessionId }, () => {});
        break;

      case 'h-retry':
        reply('Retrying last turn\u2026');
        await hermes.chat({ message: '/retry', sessionId }, () => {});
        break;

      case 'h-model': {
        const models = await hermes.models.list();
        if (models.length === 0) {
          reply('No models configured. Check ~/.hermes/config.yaml');
        } else {
          const list = models.map((m: any) => `- **${m.name}** (${m.provider})`).join('\n');
          reply(`Available models:\n${list}`);
        }
        break;
      }

      case 'h-tools': {
        const result = await hermes.tools.list();
        if (result.tools.length === 0) {
          reply('No tools available. Start the bridge first.');
        } else {
          const list = result.tools.map((t: any) => `- ${t.name} ${t.enabled ? '\u2705' : '\u274c'}`).join('\n');
          reply(`Tools (${result.tools.length}):\n${list}`);
        }
        break;
      }

      case 'h-memory': {
        const files = await hermes.memory.get();
        const entries = Object.entries(files)
          .filter(([, v]) => (v as string).trim())
          .map(([k, v]) => `**${k}** (${(v as string).length} chars)`);
        reply(entries.length > 0 ? `Memory files:\n${entries.join('\n')}` : 'No memory files found.');
        break;
      }

      case 'h-persona': {
        const persona = await hermes.persona.get();
        if (persona.content) {
          reply(`SOUL.md (${persona.content.length} chars):\n\n${persona.content.slice(0, 500)}${persona.content.length > 500 ? '\u2026' : ''}`);
        } else {
          reply('No persona configured. Edit SOUL.md in the Hermes plugin.');
        }
        break;
      }

      case 'h-skills': {
        const skills = await hermes.skills.list();
        if (skills.length === 0) {
          reply('No skills installed.');
        } else {
          const byCategory = new Map<string, string[]>();
          for (const s of skills) {
            const cat = (s as any).category || 'uncategorized';
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push((s as any).name);
          }
          const list = Array.from(byCategory.entries())
            .map(([cat, names]) => `**${cat}**: ${names.join(', ')}`)
            .join('\n');
          reply(`Skills (${skills.length}):\n${list}`);
        }
        break;
      }

      case 'h-status': {
        const info = hermes.info;
        reply(`Hermes Bridge: ${info.status}\nAgent Dir: ${info.agentDir || 'not found'}\nPID: ${info.pid || 'n/a'}`);
        break;
      }

      default:
        reply(`Unknown command: /h-${command}. Available: approve, deny, compact, undo, retry, model, tools, memory, persona, skills, status`);
    }
  } catch (err: any) {
    reply(`Command failed: ${err.message || err}`);
  }

  return { success: true };
}
