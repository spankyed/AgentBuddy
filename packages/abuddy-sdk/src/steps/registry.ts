// The registered packs' step definitions, looked up by type. The app registers them (a pack's registration's
// `steps`, and the frontend facets its frontend registers); this reads the bound registry on every call.
import type { StepDefinition, StepBuildFacet, StepRuntimeFacet, StepFEFacet, TriggerFacet } from './types.ts';
import { _boundPackExtensions } from '../runtime/packs-view.ts';

const step = (type: string): StepDefinition | undefined => _boundPackExtensions().step(type);

/** The registered step definitions and their facets, by type */
interface StepRegistry {
  get(type: string): StepDefinition | undefined;
  getBuild(type: string): StepBuildFacet | undefined;
  getRuntime(type: string): StepRuntimeFacet | undefined;
  getFE(type: string): StepFEFacet | undefined;
  getComponent(type: string): unknown | undefined;
  getFormComponent(type: string): unknown | undefined;
  has(type: string): boolean;
  isTrigger(type: string): boolean;
  getTrigger(type: string): TriggerFacet | undefined;
  triggers(): StepDefinition[];
  types(): string[];
  all(): StepDefinition[];
  createNodeDefaults(nodeType: string): Record<string, unknown>;
}

export const stepRegistry: StepRegistry = {
  get(type: string): StepDefinition | undefined {
    return step(type);
  },

  getBuild(type: string): StepBuildFacet | undefined {
    return step(type)?.build;
  },

  getRuntime(type: string): StepRuntimeFacet | undefined {
    return step(type)?.runtime;
  },

  getFE(type: string): StepFEFacet | undefined {
    return step(type)?.fe;
  },

  getComponent(type: string): unknown | undefined {
    return step(type)?.fe?.components?.node;
  },

  getFormComponent(type: string): unknown | undefined {
    return step(type)?.fe?.components?.form;
  },

  has(type: string): boolean {
    return step(type) !== undefined;
  },

  isTrigger(type: string): boolean {
    return step(type)?.kind === 'trigger';
  },

  getTrigger(type: string): TriggerFacet | undefined {
    return step(type)?.trigger;
  },

  triggers(): StepDefinition[] {
    return _boundPackExtensions().steps().filter(s => s.kind === 'trigger');
  },

  types(): string[] {
    return _boundPackExtensions().steps().map(s => s.type);
  },

  all(): StepDefinition[] {
    return _boundPackExtensions().steps();
  },

  createNodeDefaults(nodeType: string): Record<string, unknown> {
    const stepDef = step(nodeType);
    if (stepDef?.fe) {
      return {
        nodeType,
        label: stepDef.fe.nodeConfig.label,
        ...stepDef.fe.defaults,
      };
    }
    return { nodeType };
  },
};
