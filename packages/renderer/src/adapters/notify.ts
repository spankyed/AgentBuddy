// How the shell tells the user something went wrong in this window: a toast for what it can carry on from, and the
// error page `index.html` defines for what it can't.
import type { ShellNotify } from '@abuddy/host/fe';
import { globalToast } from '@/adapters/toast';

declare global {
  interface Window {
    /** Shows the error page index.html defines: an error's message over its stack, or a message */
    __showErrorPage?: (title: string, detail: string | { message: string; stack?: string }) => void;
  }
}

export const windowNotify: ShellNotify = {
  error: (title, detail) => globalToast.error(title, detail),
  errorPage: (title, detail) => window.__showErrorPage?.(title, detail),
};
