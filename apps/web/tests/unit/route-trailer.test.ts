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
  it('should process only the first active state node', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: 'Page 1', target: 'view1' }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'Page 1', target: 'view1' },
    ]);
    expect(result.target).toBe('view1');
  });

  it('should handle function-based breadcrumbs', () => {
    const breadcrumbFn = vi.fn((ctx) => ({
      label: `Thread ${ctx.threadId}`,
      target: 'threadView',
    }));
    
    const nodes = [
      createMockNode('root'),
      createMockNode('thread', breadcrumbFn),
    ];
    const context = { threadId: '123' };
    const state = createMockState(nodes, context);
    
    const result = computeCrumbs(state);
    
    expect(breadcrumbFn).toHaveBeenCalledWith(context);
    expect(result.crumbs).toEqual([
      { label: 'Thread 123', target: 'threadView' },
    ]);
    expect(result.target).toBe('threadView');
  });

  it('should only process first node even with multiple nodes', () => {
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

  it('should fallback to machine id when no active state has breadcrumb', () => {
    // Case 1: Only root node
    const state1 = createMockState([createMockNode('root')]);
    const result1 = computeCrumbs(state1);
    
    expect(result1.crumbs).toEqual([
      { label: 'TestMachine', target: 'idle' },
    ]);
    
    // Case 2: First active node has no breadcrumb
    const state2 = createMockState([
      createMockNode('root'),
      createMockNode('noBreadcrumb'),
    ]);
    const result2 = computeCrumbs(state2);
    
    expect(result2.crumbs).toEqual([
      { label: 'TestMachine', target: 'idle' },
    ]);
  });

  it('should handle breadcrumbs with undefined values', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: undefined, target: 'view1' }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: undefined, target: 'view1' },
    ]);
    expect(result.target).toBe('view1');
  });

  it('should prepend default breadcrumb when not in default state', () => {
    const defaultBreadcrumb = { label: 'Home', target: 'homeView', default: true };
    const machineConfig = {
      states: {
        home: {
          key: 'home',
          meta: { breadcrumb: defaultBreadcrumb }
        },
        profile: {
          key: 'profile',
          meta: { breadcrumb: { label: 'Profile', target: 'profileView' } }
        },
      },
    };
    
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: 'Page 1', target: 'view1' }),
    ];
    const state = createMockState(nodes, {}, { value: 'profile', machineConfig });
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      defaultBreadcrumb,
      { label: 'Page 1', target: 'view1' },
    ]);
  });

  it('should not prepend default breadcrumb when in default state', () => {
    const machineConfig = {
      states: {
        home: {
          key: 'home',
          meta: { breadcrumb: { label: 'Home', target: 'homeView', default: true } }
        },
      },
    };
    
    const nodes = [
      createMockNode('root'),
      createMockNode('home', { label: 'Home Page', target: 'homeView' }),
    ];
    const state = createMockState(nodes, {}, { value: 'home', machineConfig });
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'Home Page', target: 'homeView' },
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

  it('should handle array of breadcrumbs', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('flow', [
        { label: 'Flow A', target: 'view', info: 'A' },
        { label: 'Flow B', target: 'view', info: 'B' },
        { label: 'Flow C', target: 'view', info: 'C' },
      ]),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'Flow A', target: 'view', info: 'A' },
      { label: 'Flow B', target: 'view', info: 'B' },
      { label: 'Flow C', target: 'view', info: 'C' },
    ]);
    expect(result.target).toBe('view');
  });

  it('should handle function returning array of breadcrumbs', () => {
    const breadcrumbFn = vi.fn((ctx) => [
      { label: `${ctx.entity} List`, target: 'list' },
      { label: `${ctx.entity} ${ctx.id}`, target: 'detail', info: ctx.id },
    ]);
    
    const nodes = [
      createMockNode('root'),
      createMockNode('entity', breadcrumbFn),
    ];
    const context = { entity: 'User', id: '123' };
    const state = createMockState(nodes, context);
    
    const result = computeCrumbs(state);
    
    expect(breadcrumbFn).toHaveBeenCalledWith(context);
    expect(result.crumbs).toEqual([
      { label: 'User List', target: 'list' },
      { label: 'User 123', target: 'detail', info: '123' },
    ]);
  });

  it('should handle breadcrumbs with info property', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('item', { 
        label: 'Item Details', 
        target: 'itemView',
        info: { id: 'item-123', type: 'product' }
      }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { 
        label: 'Item Details', 
        target: 'itemView',
        info: { id: 'item-123', type: 'product' }
      },
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
  it('should return true when event target matches view param', () => {
    const context = {
      event: { type: 'TRAIL_CLICK', target: 'homeView' } as TrailClickEvent,
    };
    const params = { view: 'homeView' };

    expect(targetIs(context, params)).toBe(true);
  });

  it('should return false when event target does not match view param', () => {
    const context = {
      event: { type: 'TRAIL_CLICK', target: 'homeView' } as TrailClickEvent,
    };
    const params = { view: 'differentView' };

    expect(targetIs(context, params)).toBe(false);
  });

  it('should handle non-TRAIL_CLICK events', () => {
    const context = {
      event: { type: 'OTHER_EVENT' },
    };
    const params = { view: 'homeView' };

    // safeEvents will throw an error for non-TRAIL_CLICK events
    expect(() => targetIs(context, params)).toThrow('Expected type TRAIL_CLICK, got OTHER_EVENT');
  });

  it('should handle missing event properties', () => {
    const context = {
      event: {},
    };
    const params = { view: 'homeView' };

    // safeEvents will throw an error when type is undefined
    expect(() => targetIs(context, params)).toThrow('Expected type TRAIL_CLICK, got undefined');
  });
});

describe('TRAIL_CLICK', () => {
  it('should generate transition config for single route', () => {
    const routes: [string, string][] = [['#home', 'homeView']];
    
    const result = TRAIL_CLICK(routes);

    expect(result).toEqual({
      TRAIL_CLICK: [{
        guard: { type: 'targetIs', params: { view: 'homeView' } },
        target: '#home',
      }],
    });
  });

  it('should generate transition config for multiple routes', () => {
    const routes: [string, string][] = [
      ['#home', 'homeView'],
      ['#profile', 'profileView'],
      ['#settings', 'settingsView'],
    ];
    
    const result = TRAIL_CLICK(routes);

    expect(result).toEqual({
      TRAIL_CLICK: [
        {
          guard: { type: 'targetIs', params: { view: 'homeView' } },
          target: '#home',
        },
        {
          guard: { type: 'targetIs', params: { view: 'profileView' } },
          target: '#profile',
        },
        {
          guard: { type: 'targetIs', params: { view: 'settingsView' } },
          target: '#settings',
        },
      ],
    });
  });

  it('should handle empty routes array', () => {
    const routes: [string, string][] = [];
    
    const result = TRAIL_CLICK(routes);

    expect(result).toEqual({
      TRAIL_CLICK: [],
    });
  });
}); 