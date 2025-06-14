import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnyMachineSnapshot } from 'xstate';
import trailActor, { computeCrumbs, targetIs, TRAIL_CLICK, type UpdateData, type TrailClickEvent } from '@/core/actors/route-trailer';

// Mock console.log properly with cleanup
const originalConsoleLog = console.log;
beforeEach(() => {
  console.log = vi.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
});

// Mock factories
const createMockNode = (id: string, breadcrumb?: any) => ({
  id,
  meta: breadcrumb ? { breadcrumb } : undefined,
});

const createMockState = (
  nodes: any[], 
  context: any = {}, 
  options?: {
    value?: any;
    machineConfig?: any;
  }
): AnyMachineSnapshot => ({
  _nodes: nodes,
  context,
  value: options?.value,
  machine: {
    id: 'testMachine',
    config: {
      initial: 'idle',
      ...options?.machineConfig?.config,
    },
    states: options?.machineConfig?.states || {},
  },
} as AnyMachineSnapshot);

describe('computeCrumbs', () => {
  describe('breadcrumb processing', () => {
    it.each([
      {
        name: 'static breadcrumb',
        breadcrumb: { label: 'Page 1', target: 'view1' },
        context: {},
        expected: [{ label: 'Page 1', target: 'view1' }],
        expectedTarget: 'view1',
      },
      {
        name: 'breadcrumb with undefined label',
        breadcrumb: { label: undefined, target: 'view1' },
        context: {},
        expected: [{ label: undefined, target: 'view1' }],
        expectedTarget: 'view1',
      },
      {
        name: 'breadcrumb with info property',
        breadcrumb: { label: 'Item Details', target: 'itemView', info: { id: 'item-123', type: 'product' } },
        context: {},
        expected: [{ label: 'Item Details', target: 'itemView', info: { id: 'item-123', type: 'product' } }],
        expectedTarget: 'itemView',
      },
    ])('should handle $name', ({ breadcrumb, context, expected, expectedTarget }) => {
      const nodes = [
        createMockNode('root'),
        createMockNode('node1', breadcrumb),
      ];
      const state = createMockState(nodes, context);
      
      const result = computeCrumbs(state);
      
      expect(result.crumbs).toEqual(expected);
      expect(result.target).toBe(expectedTarget);
    });

    it.each([
      {
        name: 'simple function',
        breadcrumbFn: (ctx: any) => ({ label: `Thread ${ctx.threadId}`, target: 'threadView' }),
        context: { threadId: '123' },
        expected: [{ label: 'Thread 123', target: 'threadView' }],
      },
      {
        name: 'function returning array',
        breadcrumbFn: (ctx: any) => [
          { label: `${ctx.entity} List`, target: 'list' },
          { label: `${ctx.entity} ${ctx.id}`, target: 'detail', info: ctx.id },
        ],
        context: { entity: 'User', id: '123' },
        expected: [
          { label: 'User List', target: 'list' },
          { label: 'User 123', target: 'detail', info: '123' },
        ],
      },
    ])('should handle $name breadcrumb', ({ breadcrumbFn, context, expected }) => {
      const mockFn = vi.fn(breadcrumbFn);
      const nodes = [
        createMockNode('root'),
        createMockNode('node1', mockFn),
      ];
      const state = createMockState(nodes, context);
      
      const result = computeCrumbs(state);
      
      expect(mockFn).toHaveBeenCalledWith(context);
      expect(result.crumbs).toEqual(expected);
    });

    it('should handle array of breadcrumbs', () => {
      const breadcrumbs = [
        { label: 'Flow A', target: 'view', info: 'A' },
        { label: 'Flow B', target: 'view', info: 'B' },
        { label: 'Flow C', target: 'view', info: 'C' },
      ];
      const nodes = [
        createMockNode('root'),
        createMockNode('flow', breadcrumbs),
      ];
      const state = createMockState(nodes);
      
      const result = computeCrumbs(state);
      
      expect(result.crumbs).toEqual(breadcrumbs);
      expect(result.target).toBe('view');
    });
  });

  describe('fallback behavior', () => {
    it.each([
      {
        name: 'only root node',
        nodes: [createMockNode('root')],
      },
      {
        name: 'first active node without breadcrumb',
        nodes: [createMockNode('root'), createMockNode('noBreadcrumb')],
      },
    ])('should fallback to machine id when $name', ({ nodes }) => {
      const state = createMockState(nodes);
      const result = computeCrumbs(state);
      
      expect(result.crumbs).toEqual([
        { label: 'TestMachine', target: 'idle' },
      ]);
    });
  });

  describe('default breadcrumb handling', () => {
    const createDefaultTestConfig = (currentState: string, hasDefaultBreadcrumb: boolean = true) => {
      const defaultBreadcrumb = { label: 'Home', target: 'homeView', default: true };
      const machineConfig = {
        states: {
          home: {
            key: 'home',
            meta: hasDefaultBreadcrumb ? { breadcrumb: defaultBreadcrumb } : {}
          },
          profile: {
            key: 'profile',
            meta: { breadcrumb: { label: 'Profile', target: 'profileView' } }
          },
        },
      };
      
      return { machineConfig, defaultBreadcrumb };
    };

    it.each([
      {
        name: 'prepend default when not in default state',
        currentState: 'profile',
        shouldPrependDefault: true,
      },
      {
        name: 'not prepend default when in default state',
        currentState: 'home',
        shouldPrependDefault: false,
      },
    ])('should $name', ({ currentState, shouldPrependDefault }) => {
      const { machineConfig, defaultBreadcrumb } = createDefaultTestConfig(currentState);
      const activeBreadcrumb = { label: 'Active Page', target: 'activeView' };
      
      const nodes = [
        createMockNode('root'),
        createMockNode('active', activeBreadcrumb),
      ];
      const state = createMockState(nodes, {}, { value: currentState, machineConfig });
      
      const result = computeCrumbs(state);
      
      const expectedCrumbs = shouldPrependDefault
        ? [defaultBreadcrumb, activeBreadcrumb]
        : [activeBreadcrumb];
      
      expect(result.crumbs).toEqual(expectedCrumbs);
    });
  });

  it('should process only the first active state node', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('first', { label: 'First', target: 'firstView' }),
      createMockNode('second', { label: 'Second', target: 'secondView' }), // Ignored
      createMockNode('third', { label: 'Third', target: 'thirdView' }), // Ignored
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'First', target: 'firstView' },
    ]);
  });

  it('should handle function-based default breadcrumb', () => {
    const breadcrumbFn = vi.fn((ctx) => ({
      label: `Status: ${ctx.status}`,
      target: 'statusView',
      default: true,
    }));
    
    const machineConfig = {
      states: {
        active: {
          meta: { breadcrumb: breadcrumbFn }
        },
      },
    };
    
    const context = { status: 'running' };
    const state = createMockState(
      [createMockNode('root')], 
      context, 
      { machineConfig }
    );
    
    const result = computeCrumbs(state);
    
    // Verify the function was called to check for default
    expect(breadcrumbFn).toHaveBeenCalledWith(context);
    
    // No nodes have breadcrumbs, so falls back to machine id
    expect(result.crumbs).toEqual([
      { label: 'TestMachine', target: 'idle' },
    ]);
  });
});

describe('trailActor', () => {
  let mockActor: any;
  let onStateChange: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onStateChange = vi.fn();
    unsubscribe = vi.fn();
    mockActor = {
      getSnapshot: vi.fn(),
      subscribe: vi.fn(),
    };
  });

  it('should call onStateChange with initial state', () => {
    const initialSnapshot = createMockState([
      createMockNode('root'),
      createMockNode('page1', { label: 'Initial', target: 'init' }),
    ]);
    mockActor.getSnapshot.mockReturnValue(initialSnapshot);
    mockActor.subscribe.mockReturnValue({ unsubscribe });

    trailActor(mockActor, onStateChange);

    expect(onStateChange).toHaveBeenCalledWith({
      crumbs: [{ label: 'Initial', target: 'init' }],
      target: 'init',
    });
  });

  it('should subscribe to actor and handle state changes', () => {
    const initialSnapshot = createMockState([createMockNode('root')]);
    mockActor.getSnapshot.mockReturnValue(initialSnapshot);
    
    let subscriberCallback: any;
    mockActor.subscribe.mockImplementation((cb) => {
      subscriberCallback = cb;
      return { unsubscribe };
    });

    const cleanup = trailActor(mockActor, onStateChange);

    // Simulate state change
    const newSnapshot = createMockState([
      createMockNode('root'),
      createMockNode('page2', { label: 'New Page', target: 'newView' }),
    ]);
    subscriberCallback(newSnapshot);

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenLastCalledWith({
      crumbs: [{ label: 'New Page', target: 'newView' }],
      target: 'newView',
    });

    // Test cleanup
    cleanup();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('should ignore duplicate snapshots', () => {
    const snapshot = createMockState([createMockNode('root')]);
    mockActor.getSnapshot.mockReturnValue(snapshot);
    
    let subscriberCallback: any;
    mockActor.subscribe.mockImplementation((cb) => {
      subscriberCallback = cb;
      return { unsubscribe };
    });

    trailActor(mockActor, onStateChange);
    
    // Send the same snapshot twice
    subscriberCallback(snapshot);
    subscriberCallback(snapshot);

    // Should be called twice - once for initial, once for first subscription call
    // The second identical snapshot is ignored
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });
});

describe('targetIs', () => {
  it.each([
    {
      name: 'matching target',
      event: { type: 'TRAIL_CLICK', target: 'homeView' } as TrailClickEvent,
      view: 'homeView',
      expected: true,
    },
    {
      name: 'non-matching target',
      event: { type: 'TRAIL_CLICK', target: 'homeView' } as TrailClickEvent,
      view: 'differentView',
      expected: false,
    },
  ])('should return $expected for $name', ({ event, view, expected }) => {
    const context = { event };
    const params = { view };
    
    expect(targetIs(context, params)).toBe(expected);
  });

  it.each([
    {
      name: 'non-TRAIL_CLICK event',
      event: { type: 'OTHER_EVENT' },
      view: 'homeView',
      errorMessage: 'Expected type TRAIL_CLICK, got OTHER_EVENT',
    },
    {
      name: 'missing event type',
      event: {},
      view: 'homeView',
      errorMessage: 'Expected type TRAIL_CLICK, got undefined',
    },
  ])('should throw error for $name', ({ event, view, errorMessage }) => {
    const context = { event };
    const params = { view };
    
    expect(() => targetIs(context, params)).toThrow(errorMessage);
  });
});

describe('TRAIL_CLICK', () => {
  it.each([
    {
      name: 'single route',
      routes: [['#home', 'homeView']] as [string, string][],
      expected: {
        TRAIL_CLICK: [{
          guard: { type: 'targetIs', params: { view: 'homeView' } },
          target: '#home',
        }],
      },
    },
    {
      name: 'multiple routes',
      routes: [
        ['#home', 'homeView'],
        ['#profile', 'profileView'],
        ['#settings', 'settingsView'],
      ] as [string, string][],
      expected: {
        TRAIL_CLICK: [
          { guard: { type: 'targetIs', params: { view: 'homeView' } }, target: '#home' },
          { guard: { type: 'targetIs', params: { view: 'profileView' } }, target: '#profile' },
          { guard: { type: 'targetIs', params: { view: 'settingsView' } }, target: '#settings' },
        ],
      },
    },
    {
      name: 'empty routes',
      routes: [] as [string, string][],
      expected: { TRAIL_CLICK: [] },
    },
  ])('should generate transition config for $name', ({ routes, expected }) => {
    const result = TRAIL_CLICK(routes);
    expect(result).toEqual(expected);
  });
}); 