import {AppModule} from '../AppModule.ts';
import {MainModuleScope} from '../MainModuleScope.ts';

export abstract class AbstractSecurityRule implements AppModule {
  enable({app}: MainModuleScope): Promise<void> | void {
    app.on('web-contents-created', (_, contents) => this.applyRule(contents))
  }

  abstract applyRule(contents: Electron.WebContents): Promise<void> | void;
}
