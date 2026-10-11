import { RepositoryErrorCode } from '@apack/ears';
import { resetTestData } from '@apack/sdk/testing';
import { repository } from '#generated/repository.ts';

describe('flows repository', () => {
  beforeEach(() => {
    resetTestData();
  });

  describe('a new node starts with its step type\'s defaults', () => {
    // The backend is what creates the node the user adds, and it reads the step's `node` facet to do it.
    // While that facet was part of `fe`, the backend registration never carried it: every node was created
    // with none of its fields, and a trigger — whose fields its facet then validates — could not be added
    // at all. So these go through the repository the CREATE_NODE handler calls, with nothing passed.
    it('gives a trigger the fields its own validator requires', () => {
      const flow = repository.flowsCommands.createFlow();

      const schedule = repository.flowsCommands.createNode(flow.id, { nodeType: 'schedule' });

      expect(schedule).toMatchObject({ nodeType: 'schedule', cronExpression: '0 * * * *', label: 'Schedule' });
    });

    it('gives a step its declared field defaults and its label', () => {
      const flow = repository.flowsCommands.createFlow();

      expect(repository.flowsCommands.createNode(flow.id, { nodeType: 'switch' }))
        .toMatchObject({ nodeType: 'switch', label: 'Switch', conditions: [{ label: 'Else' }] });
      expect(repository.flowsCommands.createNode(flow.id, { nodeType: 'transform' }))
        .toMatchObject({ nodeType: 'transform', outputType: 'json' });
      expect(repository.flowsCommands.createNode(flow.id, { nodeType: 'update' }))
        .toMatchObject({ nodeType: 'update', onMissing: 'fail' });
    });

    it('lets what the caller passes win over the default', () => {
      const flow = repository.flowsCommands.createFlow();

      const schedule = repository.flowsCommands.createNode(flow.id, { nodeType: 'schedule', label: 'Nightly', cronExpression: '0 3 * * *' });

      expect(schedule).toMatchObject({ label: 'Nightly', cronExpression: '0 3 * * *' });
    });
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

      expect(fiveField).toMatchObject({ nodeType: 'schedule', cronExpression: '* * * * *' });
      expect(sixField).toMatchObject({ nodeType: 'schedule', cronExpression: '*/5 * * * * *' });
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
