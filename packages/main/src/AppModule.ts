import type {MainModuleScope} from './MainModuleScope.ts';

export interface AppModule {
  enable(context: MainModuleScope): Promise<void>|void;
}
