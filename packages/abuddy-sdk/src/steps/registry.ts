import type { StepDefinition, StepBuildFacet, StepRuntimeFacet, StepFEFacet } from './types';

class StepRegistry {
  private steps = new Map<string, StepDefinition>();

  register(def: StepDefinition): void {
    const existing = this.steps.get(def.type);
    if (existing) {
      this.steps.set(def.type, {
        ...existing,
        ...def,
        build: def.build ?? existing.build,
        runtime: def.runtime ?? existing.runtime,
        fe: def.fe ?? existing.fe,
      });
    } else {
      this.steps.set(def.type, def);
    }
  }

  get(type: string): StepDefinition | undefined {
    return this.steps.get(type);
  }

  getBuild(type: string): StepBuildFacet | undefined {
    return this.steps.get(type)?.build;
  }

  getRuntime(type: string): StepRuntimeFacet | undefined {
    return this.steps.get(type)?.runtime;
  }

  getFE(type: string): StepFEFacet | undefined {
    return this.steps.get(type)?.fe;
  }

  patchRuntime(type: string, runtime: StepRuntimeFacet): void {
    const existing = this.steps.get(type);
    if (existing) {
      existing.runtime = runtime;
    }
  }

  patchFE(type: string, fe: StepFEFacet): void {
    const existing = this.steps.get(type);
    if (existing) {
      existing.fe = fe;
    }
  }

  has(type: string): boolean {
    return this.steps.has(type);
  }

  types(): string[] {
    return [...this.steps.keys()];
  }

  all(): StepDefinition[] {
    return [...this.steps.values()];
  }

  clear(): void {
    this.steps.clear();
  }
}

export const stepRegistry = new StepRegistry();
