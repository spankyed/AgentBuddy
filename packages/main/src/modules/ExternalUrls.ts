import {AppModule} from '../AppModule.js';
import {ModuleContext} from '../ModuleContext.js';
import {session} from 'electron';
import {openExternalUrl} from './shell-access.js';

/**
 * A window opens no window of its own: what asks for one (a link with `target="_blank"`, `window.open`) is a link,
 * so it goes to the user's browser under the rule every external open follows (`shell-access.ts`), and the window
 * itself is refused.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-creation-of-new-windows
 */
export class ExternalUrls implements AppModule {

  enable({app}: ModuleContext): Promise<void> | void {
    app.on('web-contents-created', (_, contents) => {
      // Browser plugin tabs handle their own window.open → new tab
      if (contents.session === session.fromPartition('persist:browser')) return;

      contents.setWindowOpenHandler(({url}) => {
        void openExternalUrl(url);
        return {action: 'deny'};
      });
    });
  }
}


export function allowExternalUrls() {
  return new ExternalUrls();
}
