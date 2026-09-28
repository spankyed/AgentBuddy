import {AppModule} from './AppModule.ts';
import {ModuleContext} from './ModuleContext.ts';
import {app} from 'electron';

class ModuleRunner implements PromiseLike<void> {
  #promise: Promise<void>;

  constructor() {
    this.#promise = Promise.resolve();
  }

  // The thenable is the API: this class `implements PromiseLike<void>` so `await moduleRunner` runs the chain
  // (`src/index.ts`). Being awaited is the intent, not an accident.
  // eslint-disable-next-line no-thenable
  then<TResult1 = void, TResult2 = never>(onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): PromiseLike<TResult1 | TResult2> {
        return this.#promise.then(onfulfilled, onrejected);
    }

  init(module: AppModule) {
    const p = module.enable(this.#createModuleContext());

    if (p instanceof Promise) {
      this.#promise = this.#promise.then(() => p);
    }

    return this;
  }

  #createModuleContext(): ModuleContext {
    return {
      app,
    };
  }
}

export function createModuleRunner() {
  return new ModuleRunner();
}
