import { randomId } from '@abuddy/sdk/utils/pure';
import { HOST } from '@abuddy/host/bus';
import type { BusMessage } from './api-client.ts';

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

/**
 * What a verb needs from the app's API, kept as narrow as `SessionPage` so every verb stays testable in process
 * against a fake. `api-client.ts` is the real one.
 */
export interface SessionApi {
  send: (message: { to: string; event: Record<string, unknown>; sender?: string }) => Promise<void>;
  onMessage: (listener: (message: BusMessage) => void) => () => void;
  /** Why the channel is finished, or null while it works. Quoted by a round-trip that times out. */
  readonly failure: string | null;
}

/** What the session needs besides the page: its own connection, the fixture's diagnostics, and how to end */
export interface SessionDeps {
  readonly page: SessionPage;
  /** The drive session's own connection to the app's API, which is how the bus verbs travel */
  readonly api: SessionApi;
  /** Renderer errors the fixture collected, read and cleared — see `drainErrors` */
  readonly takeErrors: () => readonly string[];
}

/** A message the app emitted, as the in-page bridge or the session's own connection reports it */
export interface SeenEvent {
  readonly to?: string;
  readonly type: string;
  readonly event: Record<string, unknown>;
  /**
   * Who sent it, where the sender said — a feature's ref, or a participant's claimed name.
   *
   * Only the connection supplies this: the in-page bridge reads the renderer's xstate inspector, which sees an
   * event rather than an envelope, so a bridged event has none. It matters for the one case the bridge cannot
   * see at all — a message addressed to `host/drive`, which never reaches the renderer. Without it `/events`
   * tells an agent that something arrived for it and not who asked, which is enough to notice a question and
   * not enough to answer one.
   */
  readonly sender?: string;
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

/**
 * The name the session claims, so a system can answer *it* rather than broadcasting to every window.
 *
 * Taken from `HOST` rather than written out here: `@abuddy/host/bus` is already in this package's graph
 * (`src/app.ts` imports `createBusMachine` from it) and importing it is inert, so a second copy of the string
 * would be a thing to keep in step for no gain.
 */
export const DRIVE_REF = HOST.drive;

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
  /** Installs the in-page bridge and listens on the connection; `server.ts` awaits it before it listens */
  ready: () => Promise<void>;
  /** Drops what `ready` installed. The client itself belongs to whoever opened it. */
  stop: () => void;
}

export function createSession({ page, api, takeErrors }: SessionDeps): EngineSession {
  const seen: SeenEvent[] = [];
  let dropped = 0;
  const waiting = new Set<(event: SeenEvent) => void>();
  /** Set by `ready`; dropped by `stop`, so a session leaves no listener on a client it does not own */
  let stopApi: (() => void) | undefined;

  /**
   * Waits for the reply to *this* request.
   *
   * The id is what makes that possible, and it replaced a queue. The engine used to run one round-trip
   * at a time because `QUERY_RESULT` named no request, so the next reply of the right type had to be
   * this one's — which held only while nothing was abandoned. A request that timed out and then
   * finished still had a reply in the post, and the next caller took it. Matching the id ends that: an
   * orphan matches nobody, and a reply caused by someone else's query — a person using the Database
   * plugin while a session drives — is no longer mistaken for the engine's.
   */
  const nextReply = (requestId: string, ok: string, bad: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const receive = (event: SeenEvent): void => {
        if (event.type !== ok && event.type !== bad) return;
        if (event.event.requestId !== requestId) return;
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
        // The channel knows when it is the channel, so say that outright instead of listing possibilities
        if (api.failure !== null) {
          reject(new Error(`no answer for ${requestId}: ${api.failure}. The drive session's connection to the app is finished, so restart the session.`));
          return;
        }
        reject(new Error(`no ${ok} or ${bad} for ${requestId} within ${REPLY_TIMEOUT_MS}ms. `
          + `Either the query is still running, or no pack provides ${DATABASE_SYSTEM}, or its `
          + `system answered with a broadcast rather than a reply — which an app built before ${DRIVE_REF} `
          + 'existed does, and GET /events would then show the answer arriving unaddressed.'));
      }, REPLY_TIMEOUT_MS);
      waiting.add(receive);
    });

  /**
   * A send to a system, over the session's own connection.
   *
   * `sender` is the load-bearing field: the bus turns it into the delivery's `replyTo`, which is the only thing
   * that lets the system's `reply` come back here instead of to every window.
   *
   * It used to go through the page — `evaluateWith` into the renderer's `untypedSendToSystem` — which made the
   * renderer a participant in a database query and meant a window that could not serialise one event took every
   * later round-trip with it. Two consequences of moving it, both improvements: a send to an unknown system now
   * comes back as a refusal rather than being dropped silently in the renderer, and `/qx` works while the
   * window's own subscription is broken.
   */
  const sendToSystem = (to: string, event: Record<string, unknown>): Promise<unknown> =>
    api.send({ to, event, sender: DRIVE_REF }).then(() => null);

  const roundTrip = async (kind: keyof typeof REPLIES, code: string): Promise<unknown> => {
    const { send, ok, bad } = REPLIES[kind];
    // Minted here, by the requester: a reply can only name a request if the request named itself first
    const requestId = randomId({ prefix: `${kind}-` });
    // Armed before the send, so a reply that arrives immediately is not missed
    const reply = nextReply(requestId, ok, bad);
    await sendToSystem(DATABASE_SYSTEM, { type: send, code, requestId });
    return reply;
  };

  return {
    ready: async () => {
      /**
       * Answers a waiting round-trip, from either channel.
       *
       * Iterated directly: a receiver that matches removes *itself*, and a `Set` iterator handles an entry
       * deleted at or before the cursor. Nothing adds a waiter here — a resolved round-trip arms its next one
       * in a later microtask — so there is no entry this loop could visit too early.
       */
      const wake = (event: SeenEvent): void => {
        for (const receive of waiting) receive(event);
      };

      /** Puts an event in the buffer `/events` drains, oldest dropped past the cap */
      const record = (event: SeenEvent): void => {
        seen.push(event);
        if (seen.length > MAX_SEEN_EVENTS) {
          seen.shift();
          dropped += 1;
        }
      };

      /**
       * The session's own connection, which is where an answer arrives now.
       *
       * **Waiters hear both channels, and that is not redundancy.** A reply reaches `DRIVE_REF` only from an app
       * whose database system answers with `reply`; against an older packaged build that still broadcasts, the
       * bridge is the only path. Feeding both means a round-trip works across that skew, and the `requestId`
       * check makes the double delivery harmless — the first match removes the receiver and the second matches
       * nobody.
       *
       * **`/events` keeps its meaning**, so only what the in-page inspector cannot see is added to it: a message
       * addressed to `DRIVE_REF` never reaches the renderer, while a broadcast reaches both and would otherwise
       * be counted twice.
       */
      stopApi = api.onMessage((message) => {
        const event: SeenEvent = {
          to: message.to,
          type: message.event.type,
          event: message.event,
          ...(message.sender === undefined ? {} : { sender: message.sender }),
        };
        wake(event);
        if (message.to === DRIVE_REF) record(event);
      });

      await page.exposeFunction(BRIDGE_FUNCTION, (payload) => {
        const event = payload as SeenEvent;
        record(event);
        // A waiter is woken either way: a reply must not be lost because the buffer was full
        wake(event);
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

    stop: () => {
      stopApi?.();
      stopApi = undefined;
    },
  };
}
