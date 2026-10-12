import {AppModule} from '../AppModule.ts';
import {MainModuleScope} from '../MainModuleScope.ts';

export class HardwareAccelerationModule implements AppModule {
  readonly #shouldBeDisabled: boolean;


  constructor({enable}: {enable: boolean}) {
    this.#shouldBeDisabled = !enable;
  }

  enable({app}: MainModuleScope): Promise<void> | void {
    if (this.#shouldBeDisabled) {
      app.disableHardwareAcceleration();
    }
  }
}

export function hardwareAccelerationMode(...args: ConstructorParameters<typeof HardwareAccelerationModule>) {
  return new HardwareAccelerationModule(...args);
}
