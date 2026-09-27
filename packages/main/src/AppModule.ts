import type {ModuleContext} from './ModuleContext.ts';

export interface AppModule {
  enable(context: ModuleContext): Promise<void>|void;
}
