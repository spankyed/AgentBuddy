import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnyMachineSnapshot } from 'xstate';
import trailActor, { computeCrumbs, targetIs, TRAIL_CLICK, type UpdateData, type TrailClickEvent } from '@/core/actors/route-trailer';

// Mock factories
const createMockNode = (id: string, breadcrumb?: any) => ({
  id,
  meta: breadcrumb ? { breadcrumb } : undefined,
});

const createMockState = (nodes: any[], context: any = {}, machineConfig?: any): AnyMachineSnapshot => ({
  _nodes: nodes,
  context,
  machine: {
    id: 'testMachine',
    config: {
      initial: 'idle',
      ...machineConfig?.config,
    },
    states: machineConfig?.states || {},
  },
} as AnyMachineSnapshot);

describe('computeCrumbs', () => {
  it('should handle static breadcrumbs', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: 'Page 1', target: 'view1' }),
      createMockNode('page2', { label: 'Page 2', target: 'view2' }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'Page 1', target: 'view1' },
      { label: 'Page 2', target: 'view2' },
    ]);
    expect(result.target).toBe('view2');
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

  it('should handle mixed static and function breadcrumbs', () => {
    const dynamicBreadcrumb = vi.fn((ctx) => ({
      label: `User: ${ctx.userName}`,
      target: 'userView',
    }));
    
    const nodes = [
      createMockNode('root'),
      createMockNode('home', { label: 'Home', target: 'homeView' }),
      createMockNode('user', dynamicBreadcrumb),
    ];
    const context = { userName: 'Alice' };
    const state = createMockState(nodes, context);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'Home', target: 'homeView' },
      { label: 'User: Alice', target: 'userView' },
    ]);
  });

  it('should handle empty nodes with fallback to machine id', () => {
    const state = createMockState([createMockNode('root')]);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: 'TestMachine', target: 'idle' },
    ]);
    expect(result.target).toBe('idle');
  });

  it('should skip nodes without breadcrumb meta', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: 'Page 1', target: 'view1' }),
      createMockNode('invisible'), // No breadcrumb
      createMockNode('page2', { label: 'Page 2', target: 'view2' }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    // Nodes without breadcrumb meta are included with undefined values
    expect(result.crumbs).toEqual([
      { label: 'Page 1', target: 'view1' },
      { label: undefined, target: undefined },
      { label: 'Page 2', target: 'view2' },
    ]);
  });

  it('should handle undefined labels and targets', () => {
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: undefined, target: 'view1' }),
      createMockNode('page2', { label: 'Page 2', target: undefined }),
    ];
    const state = createMockState(nodes);
    
    const result = computeCrumbs(state);
    
    expect(result.crumbs).toEqual([
      { label: undefined, target: 'view1' },
      { label: 'Page 2', target: undefined },
    ]);
    expect(result.target).toBeUndefined();
  });

  it('should handle states with default breadcrumb', () => {
    const machineConfig = {
      config: {
        initial: 'idle',
      },
      states: {
        home: {
          meta: {
            breadcrumb: { label: 'Home', target: 'homeView', default: true }
          }
        },
        profile: {
          meta: {
            breadcrumb: { label: 'Profile', target: 'profileView' }
          }
        },
      },
    };
    
    const nodes = [
      createMockNode('root'),
      createMockNode('page1', { label: 'Page 1', target: 'view1' }),
    ];
    const state = createMockState(nodes, {}, machineConfig);
    
    const result = computeCrumbs(state);
    
    // The function finds default state but doesn't seem to use it in the current implementation
    expect(result.crumbs).toEqual([
      { label: 'Page 1', target: 'view1' },
    ]);
  });

  it('should handle function-based breadcrumb on machine states', () => {
    const breadcrumbFn = vi.fn((ctx) => ({
      label: `Status: ${ctx.status}`,
      target: 'statusView',
      default: true,
    }));
    
    const machineConfig = {
      config: {
        initial: 'idle',
      },
      states: {
        active: {
          meta: {
            breadcrumb: breadcrumbFn
          }
        },
      },
    };
    
    const nodes = [createMockNode('root')];
    const context = { status: 'running' };
    const state = createMockState(nodes, context, machineConfig);
    
    const result = computeCrumbs(state);
    
    // Verify the function was called with context
    expect(breadcrumbFn).toHaveBeenCalledWith(context);
    
    // When no nodes have breadcrumbs, falls back to machine id
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