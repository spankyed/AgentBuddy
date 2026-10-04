/**
 * The verbs a live drive session answers, over one already-open page.
 *
 * A driving script is a closed program: it runs and it ends, so every question an agent has costs an
 * edit, a process start and an app launch. These are the same capabilities the `AppHelper` already has,
 * shaped so something outside the process can ask for them one at a time against a session that stays
 * open. `server.ts` is the channel; this is what the channel calls.
 *
 * **Nothing here touches Playwright's types.** The page arrives as `SessionPage`, six methods wide, so
 * every verb is exercised in process against a fake — a session spec that had to launch Electron would
 * be an E2E test, and what is being checked is the protocol rather than the app.
 *
 * **Ending the session is not here.** `/close` has to answer before anything tears down, and only the
 * channel knows when its reply has been written — measured: ending it from the verb closed the socket
 * first and the caller saw a reset for a request that had worked. So `server.ts` owns that, and a
 * session knows only how to do things to an app.
 */

/**
 * What every verb returns, and why a failure is a value rather than a throw.
 *
 * The caller is an HTTP request, so a thrown error becomes a 500 and the agent learns only that
 * something went wrong. `ok: false` with the message keeps the channel usable: a bad query is an answer,
 * not a dropped connection, and the session carries on serving the next request.
 */
export type EngineResult = { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * What a verb needs from a page — and the two kinds of evaluation are separate methods on purpose.
 *
 * Playwright reads a **string** as an expression and a **function** as something to serialise and call
 * with an argument; a string plus an argument silently drops the argument. One method taking either
 * would make that mistake available at every call site, so the port names which is which. The string
 * form is also what `/eval` needs: an expression goes through CDP, where a renderer CSP that forbids
 * `unsafe-eval` cannot reach it, which an in-page `new Function` would not survive.
 */
export interface SessionPage {
  /** Evaluate a source expression in the page; no argument, because a string form cannot receive one */
  evaluateExpression: (source: string) => Promise<unknown>;
  /** Evaluate a function in the page with one serialisable argument */
  evaluateWith: <A>(fn: (arg: A) => unknown, arg: A) => Promise<unknown>;
  exposeFunction: (name: string, callback: (payload: unknown) => void) => Promise<void>;
  screenshot: (name: string) => Promise<unknown>;
  /**
   * The fixture's own waits, which are what `/wait` is for.
   *
   * They come from the `AppHelper` rather than being rebuilt here: a `page.waitForFunction` over the
   * snapshot already exists, handles a dotted state path, and resolves on the state arriving. Without a
   * verb for them an agent has only `/state` to re-request in a loop, which is the polling this repo
   * avoids wherever something event-driven exists — and here it does.
   */
  waitForState: (check: string, timeoutMs?: number) => Promise<unknown>;
  waitForPlugin: (pluginId: string, timeoutMs?: number) => Promise<unknown>;
}

/** What the session needs besides the page: the fixture's own diagnostics, and the way to end itself */
export interface SessionDeps {
  readonly page: SessionPage;
  /** Renderer errors the fixture collected, read and cleared — see `drainErrors` */
  readonly takeErrors: () => readonly string[];
}

/** A message the app emitted, as the in-page bridge reports it */
export interface SeenEvent {
  readonly to?: string;
  readonly type: string;
  readonly event: Record<string, unknown>;
}

/**
 * The name the in-page bridge calls, and the flag that stops it being installed twice.
 *
 * Exported so a spec asserts against the same string the page is given rather than a copy of it.
 */
export const BRIDGE_FUNCTION = '__driveEngineEmit';
export const BRIDGE_FLAG = '__driveEngineBridge';

/**
 * How many captured events the session holds before it starts dropping the oldest.
 *
 * The inspector sees every event in the app, not only replies — measured on an idle session, the app
 * emits `TRAIL_UPDATE`, `CLEAR_PULSE` and plugin traffic continuously — so a buffer nobody drains is a
 * leak that grows for as long as the session is open. Dropping the oldest keeps the recent ones, which
 * are the ones an agent asking "what just happened" wants, and `dropped` says how many it missed rather
 * than letting the gap pass silently.
 */
export const MAX_SEEN_EVENTS = 1_000;

/** How long a bus round-trip waits for its reply before answering that none came */
export const REPLY_TIMEOUT_MS = 15_000;

/** The system that runs query and transaction code against the live engine, and the events it answers with */
export const DATABASE_SYSTEM = 'default-setup/database';

const REPLIES = {
  qx: { send: 'EXECUTE_QUERY', ok: 'QUERY_RESULT', bad: 'QUERY_ERROR' },
  tx: { send: 'EXECUTE_TRANSACTION', ok: 'TRANSACTION_RESULT', bad: 'TRANSACTION_ERROR' },
} as const;

/**
 * Runs a verb and turns any throw into the failure half of `EngineResult`.
 *
 * The message is kept whole and prefixed with the verb: `Error.message` alone loses which verb failed
 * and, for a page evaluation, the in-page detail that says where.
 */
const attempt = async (what: string, run: () => Promise<unknown>): Promise<EngineResult> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: `${what}: ${error instanceof Error ? error.message : String(error)}` };
  }
};

/**
 * Wraps an agent's expression so a result that cannot cross the process boundary is described instead.
 *
 * `page.evaluate` can only return a structured-cloneable value, which is why the fixture's `getState`
 * returns `snapshot.value` and never the snapshot: an XState snapshot carries actor references and
 * functions. Without this, asking for one gets an opaque Playwright failure. Attempting the clone in the
 * page keeps `/eval` total — every expression gets an answer — and leaves `JSON.stringify` in the body
 * as the way to ask for more.
 */
export const evalSource = (body: string): string => `(async () => {
  const value = await (async function () { ${body} }).call(window);
  try {
    structuredClone(value);
    return { cloneable: true, value };
  } catch {
    return {
      cloneable: false,
      described: Object.prototype.toString.call(value),
      keys: value && typeof value === 'object' ? Object.keys(value).slice(0, 40) : [],
    };
  }
})()`;

type Evaluated = { cloneable: true; value: unknown }
  | { cloneable: false; described: string; keys: readonly string[] };

/** What `/wait` waits for: a dotted state path, or a plugin arriving. Exactly one, which `server.ts` checks */
export type WaitTarget = { readonly state: string } | { readonly plugin: string };

export interface EngineSession {
  evaluate: (body: string) => Promise<EngineResult>;
  send: (event: Record<string, unknown>) => Promise<EngineResult>;
  system: (to: string, event: Record<string, unknown>) => Promise<EngineResult>;
  qx: (code: string) => Promise<EngineResult>;
  tx: (code: string) => Promise<EngineResult>;
  state: () => Promise<EngineResult>;
  wait: (target: WaitTarget, timeoutMs?: number) => Promise<EngineResult>;
  navigate: (pluginId: string) => Promise<EngineResult>;
  screenshot: (name: string) => Promise<EngineResult>;
  drainEvents: () => EngineResult;
  drainDrops: () => Promise<EngineResult>;
  drainErrors: () => EngineResult;
  /** Installs the in-page bridge; `server.ts` awaits it before it starts listening */
  ready: () => Promise<void>;
}

export function createSession({ page, takeErrors }: SessionDeps): EngineSession {
  const seen: SeenEvent[] = [];
  let dropped = 0;
  const waiting = new Set<(event: SeenEvent) => void>();

  /**
   * One bus round-trip at a time, and the contract is the reason rather than caution.
   *
   * `QUERY_RESULT` carries no request id (default-setup's `features/database/be/types.ts`), so two
   * overlapping queries cannot be told apart by their replies. Serialising makes the next reply
   * unambiguously this request's. Adding a request id to that contract would remove the need, and is
   * the smaller change if an agent ever wants concurrency.
   */
  let queue: Promise<unknown> = Promise.resolve();
  const serialised = <R>(run: () => Promise<R>): Promise<R> => {
    const next = queue.then(run, run);
    // The chain must not inherit this call's rejection, or one failed query poisons every later one
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  const nextReply = (ok: string, bad: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const receive = (event: SeenEvent): void => {
        if (event.type !== ok && event.type !== bad) return;
        clearTimeout(timer);
        waiting.delete(receive);
        if (event.type === bad) reject(new Error(String(event.event.error ?? 'the system reported an error')));
        else resolve(event.event.result);
      };
      const timer = setTimeout(() => {
        waiting.delete(receive);
        /**
         * Three causes, named rather than guessed at.
         *
         * It read "is default-setup loaded?" and that is the rarest of them. The one that actually
         * happens is the second: a value the app cannot put on the wire — a BigInt, measured — throws
         * inside the renderer's tRPC subscription, which kills the subscription and leaves the root
         * machine in `error`, so no backend event reaches the page again and *every* later round-trip
         * times out here. The page itself still answers, which is why `/eval` and `/state` keep working
         * and make this look like a database problem. A message that names one cause sends a reader to
         * the wrong place; these two verbs tell the three apart in one call each.
         */
        reject(new Error(`no ${ok} or ${bad} within ${REPLY_TIMEOUT_MS}ms. Check GET /state for an `
          + '`error` root state and GET /errors for a serialisation failure in the subscription — a '
          + 'value the app cannot send (a BigInt, a class instance) breaks the event stream for the '
          + 'rest of the session. Otherwise the query is still running, or no pack provides '
          + `${DATABASE_SYSTEM}.`));
      }, REPLY_TIMEOUT_MS);
      waiting.add(receive);
    });

  /** A send to a system, through the app's own client — the one channel every verb here uses */
  const sendToSystem = (to: string, event: Record<string, unknown>): Promise<unknown> =>
    page.evaluateWith(([target, message]: [string, Record<string, unknown>]) => {
      (window as unknown as {
        __abuddy: { sdkEvents: { untypedSendToSystem: (to: string, event: unknown) => void } };
      }).__abuddy.sdkEvents.untypedSendToSystem(target, message);
      return null;
    }, [to, event] as [string, Record<string, unknown>]);

  const roundTrip = (kind: keyof typeof REPLIES, code: string): Promise<unknown> =>
    serialised(async () => {
      const { send, ok, bad } = REPLIES[kind];
      // Armed before the send, so a reply that arrives immediately is not missed
      const reply = nextReply(ok, bad);
      await sendToSystem(DATABASE_SYSTEM, { type: send, code });
      return reply;
    });

  return {
    ready: async () => {
      await page.exposeFunction(BRIDGE_FUNCTION, (payload) => {
        const event = payload as SeenEvent;
        seen.push(event);
        // A waiter is woken either way: a reply must not be lost because the buffer was full
        if (seen.length > MAX_SEEN_EVENTS) {
          seen.shift();
          dropped += 1;
        }
        // Iterated directly: a receiver that matches removes *itself*, and a `Set` iterator handles an
        // entry deleted at or before the cursor. Nothing adds a waiter here — a resolved round-trip
        // arms its next one in a later microtask — so there is no entry this loop could visit too early
        for (const receive of waiting) receive(event);
      });
      /**
       * The bridge is a callback into this process, not a buffer the engine reads back.
       *
       * The fixture's dropped-send collector pushes to `window.__droppedSends` and is read once at the
       * end, which suits a check and not a session: a reply has to wake the request waiting for it.
       * `exposeFunction` gives the page a direct line here, so a round-trip resolves on the event rather
       * than on anything asking repeatedly whether it has arrived.
       */
      await page.evaluateExpression(`(() => {
        const win = window;
        if (win.${BRIDGE_FLAG}) return null;
        win.${BRIDGE_FLAG} = true;
        win.applicationState?.system?.inspect?.((inspection) => {
          if (inspection?.type !== '@xstate.event') return;
          const event = inspection.event;
          if (!event || typeof event.type !== 'string') return;
          const to = inspection.actorRef?.id;
          try {
            win.${BRIDGE_FUNCTION}({ to, type: event.type, event: JSON.parse(JSON.stringify(event)) });
          } catch {
            // An event that will not serialise still happened, and that it did is worth reporting
            win.${BRIDGE_FUNCTION}({ to, type: event.type, event: {} });
          }
        });
        return null;
      })()`);
    },

    evaluate: (body) => attempt('eval', async () => {
      const result = await page.evaluateExpression(evalSource(body)) as Evaluated;
      if (result.cloneable) return result.value;
      throw new Error(`the result is not serialisable (${result.described}`
        + `${result.keys.length > 0 ? `, keys: ${result.keys.join(', ')}` : ''})`
        + ' — return JSON.stringify(...) or a projection of it instead');
    }),

    send: (event) => attempt('send', () => page.evaluateWith((message: Record<string, unknown>) => {
      (window as unknown as { applicationState: { send: (event: unknown) => void } })
        .applicationState.send(message);
      return null;
    }, event)),

    system: (to, event) => attempt('system', () => sendToSystem(to, event)),

    qx: (code) => attempt('qx', () => roundTrip('qx', code)),
    tx: (code) => attempt('tx', () => roundTrip('tx', code)),

    state: () => attempt('state', () => page.evaluateExpression(`(() => {
      const snap = window.applicationState?.getSnapshot();
      return {
        value: snap?.value,
        activePluginId: snap?.context?.activePlugin?.id ?? '',
        pluginIds: (snap?.context?.plugins ?? []).map((p) => p.id),
      };
    })()`)),

    /** The fixture's wait, so a reply arrives when the state does rather than when something asks again */
    wait: (target, timeoutMs) => attempt('wait', async () => {
      if ('state' in target) await page.waitForState(target.state, timeoutMs);
      else await page.waitForPlugin(target.plugin, timeoutMs);
      return target;
    }),

    navigate: (pluginId) => attempt('navigate', () => page.evaluateWith((id: string) => {
      (window as unknown as { applicationState: { send: (event: unknown) => void } })
        .applicationState.send({ type: 'SELECT_PLUGIN', plugin: id });
      return null;
    }, pluginId)),

    screenshot: (name) => attempt('screenshot', async () => {
      await page.screenshot(name);
      return name;
    }),

    /**
     * Read and cleared, so each call answers "since you last asked" rather than "since the session began".
     *
     * `dropped` rather than a bare array: a session the agent has not asked in a while has lost its
     * oldest events, and a reader comparing counts needs to know that happened.
     */
    drainEvents: () => {
      const value = { events: seen.splice(0, seen.length), dropped };
      dropped = 0;
      return { ok: true, value };
    },

    /**
     * The dropped sends, read **and cleared**, which is what lets a long session end cleanly.
     *
     * The fixture reads `window.__droppedSends` after the drive body and throws if it is not empty — a
     * check written for a test, where a drop should fail the thing that caused it. A session running for
     * an hour would collect every drop and fail at the very end, naming them all and blaming the
     * session. Clearing here hands them to whoever asked instead.
     */
    drainDrops: () => attempt('drops', () => page.evaluateExpression(`(() => {
      const win = window;
      const dropped = win.__droppedSends ?? [];
      win.__droppedSends = [];
      return dropped;
    })()`)),

    /** The same bargain as `drainDrops`, for the renderer errors the fixture accumulates without bound */
    drainErrors: () => ({ ok: true, value: takeErrors() }),
  };
}
