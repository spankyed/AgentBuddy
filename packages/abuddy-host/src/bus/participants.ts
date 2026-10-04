// Names claimed by a connection rather than registered by a pack.
//
// A system and a plugin are addressable because a pack declared them: the registry knows their refs and what
// events they take. A driver is neither — it is a process outside the app holding a connection — and that is the
// whole reason an agent had to reconstruct "was this for me?" from a correlation id. It could send, and nothing
// could send to it.
//
// A claim closes that with no new address grammar. `host/drive` is spelled like any other feature ref, so
// `splitRef`, `resolveName` and every gate that reads one keep working untaught, and `sendToSystem('host/drive',
// …)` resolves the way the rest do. What differs is only where the answer comes from: the registry for a pack's
// features, this for a claimed name.
//
// **The caller is the drive engine** (`abuddy-testing/src/engine/index.ts`, which claims `host/drive` once its
// own socket is open). Exercised rather than assumed: a live session answered three concurrent `/qx` calls, each
// routed back here by a system's `reply`, plus a BigInt and a circular payload that both arrived with the
// connection intact.
//
// Two earlier versions of this paragraph were wrong, in opposite directions, and both are worth remembering
// because each looked settled. The first said giving the engine a connection would cost a dependency; Node has
// had a global `WebSocket` since 22, this repo requires 23, and
// `tests/e2e/app-integration/api-access.spec.ts` already opens an authenticated socket with no import at all.
// The second said the engine therefore had no connection of its own to claim on — true when it was written,
// false within the hour, and the kind of claim a comment should not make about code that is still moving.
//
// `participants.spec.ts` covers the mechanism, including that an unclaimed name is still dropped. What it cannot
// cover is the caller, which is a Playwright session in another package — so the live run above is the only
// evidence that end works, and this is where it is recorded.
//
// **A claim lives exactly as long as its connection.** That is what makes it safe without a disconnect signal:
// the id it is keyed by is minted per WebSocket connection and dies with the socket, so a driver that goes away
// cannot keep a name, and one that reconnects claims again. `release` exists for the socket's own teardown, not
// as something a caller has to remember.
//
// A claim is keyed by a plain string rather than a `FeatureRef`, deliberately. `FeatureRef` is branded and
// "made only by `resolveName`", so narrowing an arbitrary string into one would defeat the brand at exactly the
// boundary it exists to guard. A claimed name arrives from a client, is checked against the ref grammar where it
// arrives (`bus.claim`), and is stored as what it is: a string that looked like a ref.
export interface ParticipantClaims {
  /**
   * Gives `ref` to `client`, or refuses when another live connection holds it.
   *
   * Refusing rather than taking it over is deliberate: a claim dies with its socket, so a reconnect always finds
   * the name free, and a collision therefore means two drivers are genuinely running. Letting the newest win
   * would make that look like it worked and send one of them another's answers.
   */
  claim(ref: string, client: string): { ok: true } | { ok: false; heldBy: string };
  /** Drops whatever `client` claimed. Called when its connection ends; safe for a connection that claimed nothing. */
  release(client: string): void;
  /** The connection that claimed `ref`, if one holds it. What the bus addresses an outgoing message to. */
  clientFor(ref: string): string | undefined;
  /** Every claim, for a diagnostic that wants to say what was addressable at the time */
  held(): ReadonlyMap<string, string>;
}

/** A process's claims. An instance, like the pack registry: two of them share nothing. */
export function createParticipantClaims(): ParticipantClaims {
  const byRef = new Map<string, string>();

  return {
    claim(ref, client) {
      const holder = byRef.get(ref);
      if (holder !== undefined && holder !== client) return { ok: false, heldBy: holder };
      byRef.set(ref, client);
      return { ok: true };
    },
    release(client) {
      for (const [ref, holder] of byRef) if (holder === client) byRef.delete(ref);
    },
    clientFor(ref) {
      return byRef.get(ref);
    },
    held() {
      return byRef;
    },
  };
}
