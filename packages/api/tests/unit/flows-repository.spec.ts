import { clearMemory } from '@/core/ears/attribute-storage';
import { RepositoryErrorCode } from '@/core/helpers/repository';
import { repository } from '@/repository';

describe('flows repository', () => {
  beforeEach(() => {
    clearMemory();
  });

  describe('schedule node validation', () => {
    it('creates schedule nodes with valid 5-field and 6-field cron expressions', () => {
      const flow = repository.flowsCommands.createFlow();

      const fiveField = repository.flowsCommands.createNode(flow.id, {
        nodeType: 'schedule',
        label: 'Every minute',
        cronExpression: '* * * * *',
      });
      const sixField = repository.flowsCommands.createNode(flow.id, {
        nodeType: 'schedule',
        label: 'Every five seconds',
        cronExpression: '*/5 * * * * *',
      });

      expect(fiveField.cronExpression).toBe('* * * * *');
      expect(sixField.cronExpression).toBe('*/5 * * * * *');
    });

    it('rejects invalid schedule cron expressions before persistence', () => {
      const flow = repository.flowsCommands.createFlow();

      expect(() => repository.flowsCommands.createNode(flow.id, {
        nodeType: 'schedule',
        label: 'Invalid',
        cronExpression: 'not cron',
      })).toThrow(expect.objectContaining({
        code: RepositoryErrorCode.VALIDATION_ERROR,
      }));

      expect(repository.flowsQueries.flowNodes(flow.id)).toHaveLength(0);
    });

    it('rejects invalid schedule cron updates and leaves the previous value intact', () => {
      const flow = repository.flowsCommands.createFlow();
      const schedule = repository.flowsCommands.createNode(flow.id, {
        nodeType: 'schedule',
        label: 'Valid',
        cronExpression: '* * * * *',
      });

      expect(() => repository.flowsCommands.updateNode(schedule.id, {
        cronExpression: '61 * * * *',
      })).toThrow(expect.objectContaining({
        code: RepositoryErrorCode.VALIDATION_ERROR,
      }));

      expect((repository.flowsQueries.node(schedule.id) as any).cronExpression).toBe('* * * * *');
    });

    it('does not require draft non-schedule nodes to be fully configured', () => {
      const flow = repository.flowsCommands.createFlow();

      const action = repository.flowsCommands.createNode(flow.id, {
        nodeType: 'action',
        label: 'Draft action',
      });

      expect(action.nodeType).toBe('action');
    });
  });
});
