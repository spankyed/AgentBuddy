var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/rpc/codes.mjs
var TRPC_ERROR_CODES_BY_KEY = {
  /**
  * Invalid JSON was received by the server.
  * An error occurred on the server while parsing the JSON text.
  */
  PARSE_ERROR: -32700,
  /**
  * The JSON sent is not a valid Request object.
  */
  BAD_REQUEST: -32600,
  // Internal JSON-RPC error
  INTERNAL_SERVER_ERROR: -32603,
  NOT_IMPLEMENTED: -32603,
  BAD_GATEWAY: -32603,
  SERVICE_UNAVAILABLE: -32603,
  GATEWAY_TIMEOUT: -32603,
  // Implementation specific errors
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  CONFLICT: -32009,
  PRECONDITION_FAILED: -32012,
  PAYLOAD_TOO_LARGE: -32013,
  UNSUPPORTED_MEDIA_TYPE: -32015,
  UNPROCESSABLE_CONTENT: -32022,
  TOO_MANY_REQUESTS: -32029,
  CLIENT_CLOSED_REQUEST: -32099
};

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/utils.mjs
var unsetMarker = Symbol();
function mergeWithoutOverrides(obj1, ...objs) {
  const newObj = Object.assign(/* @__PURE__ */ Object.create(null), obj1);
  for (const overrides of objs) {
    for (const key in overrides) {
      if (key in newObj && newObj[key] !== overrides[key]) {
        throw new Error(`Duplicate key ${key}`);
      }
      newObj[key] = overrides[key];
    }
  }
  return newObj;
}
function isObject(value) {
  return !!value && !Array.isArray(value) && typeof value === "object";
}
function isFunction(fn) {
  return typeof fn === "function";
}
function omitPrototype(obj) {
  return Object.assign(/* @__PURE__ */ Object.create(null), obj);
}
var asyncIteratorsSupported = typeof Symbol === "function" && !!Symbol.asyncIterator;
function isAsyncIterable(value) {
  return asyncIteratorsSupported && isObject(value) && Symbol.asyncIterator in value;
}
var run = (fn) => fn();

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/http/getHTTPStatusCode.mjs
var JSONRPC2_TO_HTTP_CODE = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};
function getStatusCodeFromKey(code) {
  return JSONRPC2_TO_HTTP_CODE[code] ?? 500;
}
function getHTTPStatusCodeFromError(error) {
  return getStatusCodeFromKey(error.code);
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/error/getErrorShape.mjs
function getErrorShape(opts) {
  const { path, error, config } = opts;
  const { code } = opts.error;
  const shape = {
    message: error.message,
    code: TRPC_ERROR_CODES_BY_KEY[code],
    data: {
      code,
      httpStatus: getHTTPStatusCodeFromError(error)
    }
  };
  if (config.isDev && typeof opts.error.stack === "string") {
    shape.data.stack = opts.error.stack;
  }
  if (typeof path === "string") {
    shape.data.path = path;
  }
  return config.errorFormatter({
    ...opts,
    shape
  });
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/error/TRPCError.mjs
function _define_property(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
var UnknownCauseError = class extends Error {
};
function getCauseFromUnknown(cause) {
  if (cause instanceof Error) {
    return cause;
  }
  const type = typeof cause;
  if (type === "undefined" || type === "function" || cause === null) {
    return void 0;
  }
  if (type !== "object") {
    return new Error(String(cause));
  }
  if (isObject(cause)) {
    const err = new UnknownCauseError();
    for (const key in cause) {
      err[key] = cause[key];
    }
    return err;
  }
  return void 0;
}
function getTRPCErrorFromUnknown(cause) {
  if (cause instanceof TRPCError) {
    return cause;
  }
  if (cause instanceof Error && cause.name === "TRPCError") {
    return cause;
  }
  const trpcError = new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    cause
  });
  if (cause instanceof Error && cause.stack) {
    trpcError.stack = cause.stack;
  }
  return trpcError;
}
var TRPCError = class extends Error {
  constructor(opts) {
    const cause = getCauseFromUnknown(opts.cause);
    const message2 = opts.message ?? cause?.message ?? opts.code;
    super(message2, {
      cause
    }), // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
    _define_property(this, "cause", void 0), _define_property(this, "code", void 0);
    this.code = opts.code;
    this.name = "TRPCError";
    if (!this.cause) {
      this.cause = cause;
    }
  }
};

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/createProxy.mjs
var noop = () => {
};
var freezeIfAvailable = (obj) => {
  if (Object.freeze) {
    Object.freeze(obj);
  }
};
function createInnerProxy(callback, path, memo) {
  var _memo, _cacheKey;
  const cacheKey = path.join(".");
  (_memo = memo)[_cacheKey = cacheKey] ?? (_memo[_cacheKey] = new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== "string" || key === "then") {
        return void 0;
      }
      return createInnerProxy(callback, [
        ...path,
        key
      ], memo);
    },
    apply(_1, _2, args) {
      const lastOfPath = path[path.length - 1];
      let opts = {
        args,
        path
      };
      if (lastOfPath === "call") {
        opts = {
          args: args.length >= 2 ? [
            args[1]
          ] : [],
          path: path.slice(0, -1)
        };
      } else if (lastOfPath === "apply") {
        opts = {
          args: args.length >= 2 ? args[1] : [],
          path: path.slice(0, -1)
        };
      }
      freezeIfAvailable(opts.args);
      freezeIfAvailable(opts.path);
      return callback(opts);
    }
  }));
  return memo[cacheKey];
}
var createRecursiveProxy = (callback) => createInnerProxy(callback, [], /* @__PURE__ */ Object.create(null));

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/error/formatter.mjs
var defaultFormatter = ({ shape }) => {
  return shape;
};

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/transformer.mjs
function getDataTransformer(transformer) {
  if ("input" in transformer) {
    return transformer;
  }
  return {
    input: transformer,
    output: transformer
  };
}
var defaultTransformer = {
  input: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj
  },
  output: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj
  }
};
function transformTRPCResponseItem(config, item) {
  if ("error" in item) {
    return {
      ...item,
      error: config.transformer.output.serialize(item.error)
    };
  }
  if ("data" in item.result) {
    return {
      ...item,
      result: {
        ...item.result,
        data: config.transformer.output.serialize(item.result.data)
      }
    };
  }
  return item;
}
function transformTRPCResponse(config, itemOrItems) {
  return Array.isArray(itemOrItems) ? itemOrItems.map((item) => transformTRPCResponseItem(config, item)) : transformTRPCResponseItem(config, itemOrItems);
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/router.mjs
var lazySymbol = Symbol("lazy");
function once(fn) {
  const uncalled = Symbol();
  let result = uncalled;
  return () => {
    if (result === uncalled) {
      result = fn();
    }
    return result;
  };
}
function isLazy(input) {
  return typeof input === "function" && lazySymbol in input;
}
function isRouter(value) {
  return isObject(value) && isObject(value["_def"]) && "router" in value["_def"];
}
var emptyRouter = {
  _ctx: null,
  _errorShape: null,
  _meta: null,
  queries: {},
  mutations: {},
  subscriptions: {},
  errorFormatter: defaultFormatter,
  transformer: defaultTransformer
};
var reservedWords = [
  /**
  * Then is a reserved word because otherwise we can't return a promise that returns a Proxy
  * since JS will think that `.then` is something that exists
  */
  "then",
  /**
  * `fn.call()` and `fn.apply()` are reserved words because otherwise we can't call a function using `.call` or `.apply`
  */
  "call",
  "apply"
];
function createRouterFactory(config) {
  function createRouterInner(input) {
    const reservedWordsUsed = new Set(Object.keys(input).filter((v) => reservedWords.includes(v)));
    if (reservedWordsUsed.size > 0) {
      throw new Error("Reserved words used in `router({})` call: " + Array.from(reservedWordsUsed).join(", "));
    }
    const procedures = omitPrototype({});
    const lazy2 = omitPrototype({});
    function createLazyLoader(opts) {
      return {
        ref: opts.ref,
        load: once(async () => {
          const router3 = await opts.ref();
          const lazyPath = [
            ...opts.path,
            opts.key
          ];
          const lazyKey = lazyPath.join(".");
          opts.aggregate[opts.key] = step(router3._def.record, lazyPath);
          delete lazy2[lazyKey];
          for (const [nestedKey, nestedItem] of Object.entries(router3._def.lazy)) {
            const nestedRouterKey = [
              ...lazyPath,
              nestedKey
            ].join(".");
            lazy2[nestedRouterKey] = createLazyLoader({
              ref: nestedItem.ref,
              path: lazyPath,
              key: nestedKey,
              aggregate: opts.aggregate[opts.key]
            });
          }
        })
      };
    }
    function step(from, path = []) {
      const aggregate = omitPrototype({});
      for (const [key, item] of Object.entries(from ?? {})) {
        if (isLazy(item)) {
          lazy2[[
            ...path,
            key
          ].join(".")] = createLazyLoader({
            path,
            ref: item,
            key,
            aggregate
          });
          continue;
        }
        if (isRouter(item)) {
          aggregate[key] = step(item._def.record, [
            ...path,
            key
          ]);
          continue;
        }
        if (!isProcedure(item)) {
          aggregate[key] = step(item, [
            ...path,
            key
          ]);
          continue;
        }
        const newPath = [
          ...path,
          key
        ].join(".");
        if (procedures[newPath]) {
          throw new Error(`Duplicate key: ${newPath}`);
        }
        procedures[newPath] = item;
        aggregate[key] = item;
      }
      return aggregate;
    }
    const record = step(input);
    const _def = {
      _config: config,
      router: true,
      procedures,
      lazy: lazy2,
      ...emptyRouter,
      record
    };
    const router2 = {
      ...record,
      _def,
      createCaller: createCallerFactory()({
        _def
      })
    };
    return router2;
  }
  return createRouterInner;
}
function isProcedure(procedureOrRouter) {
  return typeof procedureOrRouter === "function";
}
async function getProcedureAtPath(router2, path) {
  const { _def } = router2;
  let procedure2 = _def.procedures[path];
  while (!procedure2) {
    const key = Object.keys(_def.lazy).find((key2) => path.startsWith(key2));
    if (!key) {
      return null;
    }
    const lazyRouter = _def.lazy[key];
    await lazyRouter.load();
    procedure2 = _def.procedures[path];
  }
  return procedure2;
}
async function callProcedure(opts) {
  const { type, path } = opts;
  const proc = await getProcedureAtPath(opts.router, path);
  if (!proc || !isProcedure(proc) || proc._def.type !== type && !opts.allowMethodOverride) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No "${type}"-procedure on path "${path}"`
    });
  }
  if (proc._def.type !== type && opts.allowMethodOverride && proc._def.type === "subscription") {
    throw new TRPCError({
      code: "METHOD_NOT_SUPPORTED",
      message: `Method override is not supported for subscriptions`
    });
  }
  return proc(opts);
}
function createCallerFactory() {
  return function createCallerInner(router2) {
    const { _def } = router2;
    return function createCaller(ctxOrCallback, opts) {
      return createRecursiveProxy(async ({ path, args }) => {
        const fullPath = path.join(".");
        if (path.length === 1 && path[0] === "_def") {
          return _def;
        }
        const procedure2 = await getProcedureAtPath(router2, fullPath);
        let ctx = void 0;
        try {
          if (!procedure2) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `No procedure found on path "${path}"`
            });
          }
          ctx = isFunction(ctxOrCallback) ? await Promise.resolve(ctxOrCallback()) : ctxOrCallback;
          return await procedure2({
            path: fullPath,
            getRawInput: async () => args[0],
            ctx,
            type: procedure2._def.type,
            signal: opts?.signal
          });
        } catch (cause) {
          opts?.onError?.({
            ctx,
            error: getTRPCErrorFromUnknown(cause),
            input: args[0],
            path: fullPath,
            type: procedure2?._def.type ?? "unknown"
          });
          throw cause;
        }
      });
    };
  };
}
function mergeRouters(...routerList) {
  const record = mergeWithoutOverrides({}, ...routerList.map((r) => r._def.record));
  const errorFormatter = routerList.reduce((currentErrorFormatter, nextRouter) => {
    if (nextRouter._def._config.errorFormatter && nextRouter._def._config.errorFormatter !== defaultFormatter) {
      if (currentErrorFormatter !== defaultFormatter && currentErrorFormatter !== nextRouter._def._config.errorFormatter) {
        throw new Error("You seem to have several error formatters");
      }
      return nextRouter._def._config.errorFormatter;
    }
    return currentErrorFormatter;
  }, defaultFormatter);
  const transformer = routerList.reduce((prev, current) => {
    if (current._def._config.transformer && current._def._config.transformer !== defaultTransformer) {
      if (prev !== defaultTransformer && prev !== current._def._config.transformer) {
        throw new Error("You seem to have several transformers");
      }
      return current._def._config.transformer;
    }
    return prev;
  }, defaultTransformer);
  const router2 = createRouterFactory({
    errorFormatter,
    transformer,
    isDev: routerList.every((r) => r._def._config.isDev),
    allowOutsideOfServer: routerList.every((r) => r._def._config.allowOutsideOfServer),
    isServer: routerList.every((r) => r._def._config.isServer),
    $types: routerList[0]?._def._config.$types
  })(record);
  return router2;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/http/parseConnectionParams.mjs
function parseConnectionParamsFromUnknown(parsed) {
  try {
    if (parsed === null) {
      return null;
    }
    if (!isObject(parsed)) {
      throw new Error("Expected object");
    }
    const nonStringValues = Object.entries(parsed).filter(([_key, value]) => typeof value !== "string");
    if (nonStringValues.length > 0) {
      throw new Error(`Expected connectionParams to be string values. Got ${nonStringValues.map(([key, value]) => `${key}: ${typeof value}`).join(", ")}`);
    }
    return parsed;
  } catch (cause) {
    throw new TRPCError({
      code: "PARSE_ERROR",
      message: "Invalid connection params shape",
      cause
    });
  }
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/procedure.mjs
var procedureTypes = [
  "query",
  "mutation",
  "subscription"
];

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/rpc/parseTRPCMessage.mjs
function assertIsObject(obj) {
  if (!isObject(obj)) {
    throw new Error("Not an object");
  }
}
function assertIsProcedureType(obj) {
  if (!procedureTypes.includes(obj)) {
    throw new Error("Invalid procedure type");
  }
}
function assertIsRequestId(obj) {
  if (obj !== null && typeof obj === "number" && isNaN(obj) && typeof obj !== "string") {
    throw new Error("Invalid request id");
  }
}
function assertIsString(obj) {
  if (typeof obj !== "string") {
    throw new Error("Invalid string");
  }
}
function assertIsJSONRPC2OrUndefined(obj) {
  if (typeof obj !== "undefined" && obj !== "2.0") {
    throw new Error("Must be JSONRPC 2.0");
  }
}
function parseTRPCMessage(obj, transformer) {
  assertIsObject(obj);
  const { id, jsonrpc, method, params } = obj;
  assertIsRequestId(id);
  assertIsJSONRPC2OrUndefined(jsonrpc);
  if (method === "subscription.stop") {
    return {
      id,
      jsonrpc,
      method
    };
  }
  assertIsProcedureType(method);
  assertIsObject(params);
  const { input: rawInput, path, lastEventId } = params;
  assertIsString(path);
  if (lastEventId !== void 0) {
    assertIsString(lastEventId);
  }
  const input = transformer.input.deserialize(rawInput);
  return {
    id,
    jsonrpc,
    method,
    params: {
      input,
      path,
      lastEventId
    }
  };
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/observable/observable.mjs
function isObservable(x) {
  return typeof x === "object" && x !== null && "subscribe" in x;
}
function observable(subscribe) {
  const self = {
    subscribe(observer) {
      let teardownRef = null;
      let isDone = false;
      let unsubscribed = false;
      let teardownImmediately = false;
      function unsubscribe() {
        if (teardownRef === null) {
          teardownImmediately = true;
          return;
        }
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;
        if (typeof teardownRef === "function") {
          teardownRef();
        } else if (teardownRef) {
          teardownRef.unsubscribe();
        }
      }
      teardownRef = subscribe({
        next(value) {
          if (isDone) {
            return;
          }
          observer.next?.(value);
        },
        error(err) {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.error?.(err);
          unsubscribe();
        },
        complete() {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.complete?.();
          unsubscribe();
        }
      });
      if (teardownImmediately) {
        unsubscribe();
      }
      return {
        unsubscribe
      };
    },
    pipe(...operations) {
      return operations.reduce(pipeReducer, self);
    }
  };
  return self;
}
function pipeReducer(prev, fn) {
  return fn(prev);
}
function observableToReadableStream(observable2, signal) {
  let unsub = null;
  const onAbort = () => {
    unsub?.unsubscribe();
    unsub = null;
    signal.removeEventListener("abort", onAbort);
  };
  return new ReadableStream({
    start(controller) {
      unsub = observable2.subscribe({
        next(data) {
          controller.enqueue({
            ok: true,
            value: data
          });
        },
        error(error) {
          controller.enqueue({
            ok: false,
            error
          });
          controller.close();
        },
        complete() {
          controller.close();
        }
      });
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, {
          once: true
        });
      }
    },
    cancel() {
      onAbort();
    }
  });
}
function observableToAsyncIterable(observable2, signal) {
  const stream = observableToReadableStream(observable2, signal);
  const reader = stream.getReader();
  const iterator = {
    async next() {
      const value = await reader.read();
      if (value.done) {
        return {
          value: void 0,
          done: true
        };
      }
      const { value: result } = value;
      if (!result.ok) {
        throw result.error;
      }
      return {
        value: result.value,
        done: false
      };
    },
    async return() {
      await reader.cancel();
      return {
        value: void 0,
        done: true
      };
    }
  };
  return {
    [Symbol.asyncIterator]() {
      return iterator;
    }
  };
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/vendor/unpromise/unpromise.mjs
function _define_property2(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
var _computedKey;
var subscribableCache = /* @__PURE__ */ new WeakMap();
var NOOP = () => {
};
_computedKey = Symbol.toStringTag;
var _computedKey1 = _computedKey;
var Unpromise = class _Unpromise {
  /** Create a promise that mitigates uncontrolled subscription to a long-lived
  * Promise via .then() and .catch() - otherwise a source of memory leaks.
  *
  * The returned promise has an `unsubscribe()` method which can be called when
  * the Promise is no longer being tracked by application logic, and which
  * ensures that there is no reference chain from the original promise to the
  * new one, and therefore no memory leak.
  *
  * If original promise has not yet settled, this adds a new unique promise
  * that listens to then/catch events, along with an `unsubscribe()` method to
  * detach it.
  *
  * If original promise has settled, then creates a new Promise.resolve() or
  * Promise.reject() and provided unsubscribe is a noop.
  *
  * If you call `unsubscribe()` before the returned Promise has settled, it
  * will never settle.
  */
  subscribe() {
    let promise;
    let unsubscribe;
    const { settlement } = this;
    if (settlement === null) {
      if (this.subscribers === null) {
        throw new Error("Unpromise settled but still has subscribers");
      }
      const subscriber = withResolvers();
      this.subscribers = listWithMember(this.subscribers, subscriber);
      promise = subscriber.promise;
      unsubscribe = () => {
        if (this.subscribers !== null) {
          this.subscribers = listWithoutMember(this.subscribers, subscriber);
        }
      };
    } else {
      const { status } = settlement;
      if (status === "fulfilled") {
        promise = Promise.resolve(settlement.value);
      } else {
        promise = Promise.reject(settlement.reason);
      }
      unsubscribe = NOOP;
    }
    return Object.assign(promise, {
      unsubscribe
    });
  }
  /** STANDARD PROMISE METHODS (but returning a SubscribedPromise) */
  then(onfulfilled, onrejected) {
    const subscribed = this.subscribe();
    const { unsubscribe } = subscribed;
    return Object.assign(subscribed.then(onfulfilled, onrejected), {
      unsubscribe
    });
  }
  catch(onrejected) {
    const subscribed = this.subscribe();
    const { unsubscribe } = subscribed;
    return Object.assign(subscribed.catch(onrejected), {
      unsubscribe
    });
  }
  finally(onfinally) {
    const subscribed = this.subscribe();
    const { unsubscribe } = subscribed;
    return Object.assign(subscribed.finally(onfinally), {
      unsubscribe
    });
  }
  /** Unpromise STATIC METHODS */
  /** Create or Retrieve the proxy Unpromise (a re-used Unpromise for the VM lifetime
  * of the provided Promise reference) */
  static proxy(promise) {
    const cached = _Unpromise.getSubscribablePromise(promise);
    return typeof cached !== "undefined" ? cached : _Unpromise.createSubscribablePromise(promise);
  }
  /** Create and store an Unpromise keyed by an original Promise. */
  static createSubscribablePromise(promise) {
    const created = new _Unpromise(promise);
    subscribableCache.set(promise, created);
    subscribableCache.set(created, created);
    return created;
  }
  /** Retrieve a previously-created Unpromise keyed by an original Promise. */
  static getSubscribablePromise(promise) {
    return subscribableCache.get(promise);
  }
  /** Promise STATIC METHODS */
  /** Lookup the Unpromise for this promise, and derive a SubscribedPromise from
  * it (that can be later unsubscribed to eliminate Memory leaks) */
  static resolve(value) {
    const promise = typeof value === "object" && value !== null && "then" in value && typeof value.then === "function" ? value : Promise.resolve(value);
    return _Unpromise.proxy(promise).subscribe();
  }
  static async any(values) {
    const valuesArray = Array.isArray(values) ? values : [
      ...values
    ];
    const subscribedPromises = valuesArray.map(_Unpromise.resolve);
    try {
      return await Promise.any(subscribedPromises);
    } finally {
      subscribedPromises.forEach(({ unsubscribe }) => {
        unsubscribe();
      });
    }
  }
  static async race(values) {
    const valuesArray = Array.isArray(values) ? values : [
      ...values
    ];
    const subscribedPromises = valuesArray.map(_Unpromise.resolve);
    try {
      return await Promise.race(subscribedPromises);
    } finally {
      subscribedPromises.forEach(({ unsubscribe }) => {
        unsubscribe();
      });
    }
  }
  /** Create a race of SubscribedPromises that will fulfil to a single winning
  * Promise (in a 1-Tuple). Eliminates memory leaks from long-lived promises
  * accumulating .then() and .catch() subscribers. Allows simple logic to
  * consume the result, like...
  * ```ts
  * const [ winner ] = await Unpromise.race([ promiseA, promiseB ]);
  * if(winner === promiseB){
  *   const result = await promiseB;
  *   // do the thing
  * }
  * ```
  * */
  static async raceReferences(promises) {
    const selfPromises = promises.map(resolveSelfTuple);
    try {
      return await Promise.race(selfPromises);
    } finally {
      for (const promise of selfPromises) {
        promise.unsubscribe();
      }
    }
  }
  constructor(arg) {
    _define_property2(this, "promise", void 0);
    _define_property2(this, "subscribers", []);
    _define_property2(this, "settlement", null);
    _define_property2(this, _computedKey1, "Unpromise");
    if (typeof arg === "function") {
      this.promise = new Promise(arg);
    } else {
      this.promise = arg;
    }
    const thenReturn = this.promise.then((value) => {
      const { subscribers } = this;
      this.subscribers = null;
      this.settlement = {
        status: "fulfilled",
        value
      };
      subscribers?.forEach(({ resolve }) => {
        resolve(value);
      });
    });
    if ("catch" in thenReturn) {
      thenReturn.catch((reason) => {
        const { subscribers } = this;
        this.subscribers = null;
        this.settlement = {
          status: "rejected",
          reason
        };
        subscribers?.forEach(({ reject }) => {
          reject(reason);
        });
      });
    }
  }
};
function resolveSelfTuple(promise) {
  return Unpromise.proxy(promise).then(() => [
    promise
  ]);
}
function withResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    promise,
    resolve,
    reject
  };
}
function listWithMember(arr, member) {
  return [
    ...arr,
    member
  ];
}
function listWithoutIndex(arr, index) {
  return [
    ...arr.slice(0, index),
    ...arr.slice(index + 1)
  ];
}
function listWithoutMember(arr, member) {
  const index = arr.indexOf(member);
  if (index !== -1) {
    return listWithoutIndex(arr, index);
  }
  return arr;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/stream/utils/disposable.mjs
var _Symbol;
var _Symbol1;
(_Symbol = Symbol).dispose ?? (_Symbol.dispose = Symbol());
(_Symbol1 = Symbol).asyncDispose ?? (_Symbol1.asyncDispose = Symbol());
function makeAsyncResource(thing, dispose) {
  const it = thing;
  const existing = it[Symbol.asyncDispose];
  it[Symbol.asyncDispose] = async () => {
    await dispose();
    await existing?.();
  };
  return it;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/stream/utils/timerResource.mjs
var disposablePromiseTimerResult = Symbol();

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/stream/utils/asyncIterable.mjs
function iteratorResource(iterable) {
  const iterator = iterable[Symbol.asyncIterator]();
  return makeAsyncResource(iterator, async () => {
    await iterator.return?.();
  });
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/stream/tracked.mjs
var trackedSymbol = Symbol();
function isTrackedEnvelope(value) {
  return Array.isArray(value) && value[2] === trackedSymbol;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/rootConfig.mjs
var isServerDefault = typeof window === "undefined" || "Deno" in window || // eslint-disable-next-line @typescript-eslint/dot-notation
globalThis.process?.env?.["NODE_ENV"] === "test" || !!globalThis.process?.env?.["JEST_WORKER_ID"] || !!globalThis.process?.env?.["VITEST_WORKER_ID"];

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/adapters/node-http/incomingMessageToRequest.mjs
function createURL(req) {
  try {
    const protocol = (
      // http2
      req.headers[":scheme"] && req.headers[":scheme"] === "https" || // http1
      req.socket && "encrypted" in req.socket && req.socket.encrypted ? "https:" : "http:"
    );
    const host = req.headers.host ?? req.headers[":authority"] ?? "localhost";
    return new URL(req.url, `${protocol}//${host}`);
  } catch (cause) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid URL",
      cause
    });
  }
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/adapters/ws.mjs
function _ts_add_disposable_resource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env.stack.push({
      value,
      dispose,
      async
    });
  } else {
    env.stack.push({
      async: true
    });
  }
  return value;
}
function _ts_dispose_resources(env) {
  var _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message2) {
    var e = new Error(message2);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
  };
  return (_ts_dispose_resources = function _ts_dispose_resources2(env2) {
    function fail(e) {
      env2.error = env2.hasError ? new _SuppressedError(e, env2.error, "An error was suppressed during disposal.") : e;
      env2.hasError = true;
    }
    var r, s = 0;
    function next() {
      while (r = env2.stack.pop()) {
        try {
          if (!r.async && s === 1) return s = 0, env2.stack.push(r), Promise.resolve().then(next);
          if (r.dispose) {
            var result = r.dispose.call(r.value);
            if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
              fail(e);
              return next();
            });
          } else s |= 1;
        } catch (e) {
          fail(e);
        }
      }
      if (s === 1) return env2.hasError ? Promise.reject(env2.error) : Promise.resolve();
      if (env2.hasError) throw env2.error;
    }
    return next();
  })(env);
}
var WEBSOCKET_OPEN = 1;
function getWSConnectionHandler(opts) {
  const { createContext: createContext2, router: router2 } = opts;
  const { transformer } = router2._def._config;
  return (client, req) => {
    const clientSubscriptions = /* @__PURE__ */ new Map();
    const abortController = new AbortController();
    if (opts.keepAlive?.enabled) {
      const { pingMs, pongWaitMs } = opts.keepAlive;
      handleKeepAlive(client, pingMs, pongWaitMs);
    }
    function respond(untransformedJSON) {
      client.send(JSON.stringify(transformTRPCResponse(router2._def._config, untransformedJSON)));
    }
    async function createCtxPromise(getConnectionParams) {
      try {
        return await run(async () => {
          ctx = await createContext2?.({
            req,
            res: client,
            info: {
              connectionParams: getConnectionParams(),
              calls: [],
              isBatchCall: false,
              accept: null,
              type: "unknown",
              signal: abortController.signal,
              url: null
            }
          });
          return {
            ok: true,
            value: ctx
          };
        });
      } catch (cause) {
        const error = getTRPCErrorFromUnknown(cause);
        opts.onError?.({
          error,
          path: void 0,
          type: "unknown",
          ctx,
          req,
          input: void 0
        });
        respond({
          id: null,
          error: getErrorShape({
            config: router2._def._config,
            error,
            type: "unknown",
            path: void 0,
            input: void 0,
            ctx
          })
        });
        (globalThis.setImmediate ?? globalThis.setTimeout)(() => {
          client.close();
        });
        return {
          ok: false,
          error
        };
      }
    }
    let ctx = void 0;
    let ctxPromise = createURL(req).searchParams.get("connectionParams") === "1" ? null : createCtxPromise(() => null);
    function handleRequest(msg) {
      const { id, jsonrpc } = msg;
      if (id === null) {
        const error = getTRPCErrorFromUnknown(new TRPCError({
          code: "PARSE_ERROR",
          message: "`id` is required"
        }));
        opts.onError?.({
          error,
          path: void 0,
          type: "unknown",
          ctx,
          req,
          input: void 0
        });
        respond({
          id,
          jsonrpc,
          error: getErrorShape({
            config: router2._def._config,
            error,
            type: "unknown",
            path: void 0,
            input: void 0,
            ctx
          })
        });
        return;
      }
      if (msg.method === "subscription.stop") {
        clientSubscriptions.get(id)?.abort();
        return;
      }
      const { path, lastEventId } = msg.params;
      let { input } = msg.params;
      const type = msg.method;
      if (lastEventId !== void 0) {
        if (isObject(input)) {
          input = {
            ...input,
            lastEventId
          };
        } else {
          input ?? (input = {
            lastEventId
          });
        }
      }
      run(async () => {
        const res = await ctxPromise;
        if (!res.ok) {
          throw res.error;
        }
        const abortController2 = new AbortController();
        const result = await callProcedure({
          router: router2,
          path,
          getRawInput: async () => input,
          ctx,
          type,
          signal: abortController2.signal
        });
        const isIterableResult = isAsyncIterable(result) || isObservable(result);
        if (type !== "subscription") {
          if (isIterableResult) {
            throw new TRPCError({
              code: "UNSUPPORTED_MEDIA_TYPE",
              message: `Cannot return an async iterable or observable from a ${type} procedure with WebSockets`
            });
          }
          respond({
            id,
            jsonrpc,
            result: {
              type: "data",
              data: result
            }
          });
          return;
        }
        if (!isIterableResult) {
          throw new TRPCError({
            message: `Subscription ${path} did not return an observable or a AsyncGenerator`,
            code: "INTERNAL_SERVER_ERROR"
          });
        }
        if (client.readyState !== WEBSOCKET_OPEN) {
          return;
        }
        if (clientSubscriptions.has(id)) {
          throw new TRPCError({
            message: `Duplicate id ${id}`,
            code: "BAD_REQUEST"
          });
        }
        const iterable = isObservable(result) ? observableToAsyncIterable(result, abortController2.signal) : result;
        run(async () => {
          const env = {
            stack: [],
            error: void 0,
            hasError: false
          };
          try {
            const iterator = _ts_add_disposable_resource(env, iteratorResource(iterable), true);
            ;
            const abortPromise = new Promise((resolve) => {
              abortController2.signal.onabort = () => resolve("abort");
            });
            let next;
            let result2;
            while (true) {
              next = await Unpromise.race([
                iterator.next().catch(getTRPCErrorFromUnknown),
                abortPromise
              ]);
              if (next === "abort") {
                await iterator.return?.();
                break;
              }
              if (next instanceof Error) {
                const error = getTRPCErrorFromUnknown(next);
                opts.onError?.({
                  error,
                  path,
                  type,
                  ctx,
                  req,
                  input
                });
                respond({
                  id,
                  jsonrpc,
                  error: getErrorShape({
                    config: router2._def._config,
                    error,
                    type,
                    path,
                    input,
                    ctx
                  })
                });
                break;
              }
              if (next.done) {
                break;
              }
              result2 = {
                type: "data",
                data: next.value
              };
              if (isTrackedEnvelope(next.value)) {
                const [id2, data] = next.value;
                result2.id = id2;
                result2.data = {
                  id: id2,
                  data
                };
              }
              respond({
                id,
                jsonrpc,
                result: result2
              });
              next = null;
              result2 = null;
            }
            respond({
              id,
              jsonrpc,
              result: {
                type: "stopped"
              }
            });
            clientSubscriptions.delete(id);
          } catch (e) {
            env.error = e;
            env.hasError = true;
          } finally {
            const result2 = _ts_dispose_resources(env);
            if (result2) await result2;
          }
        }).catch((cause) => {
          const error = getTRPCErrorFromUnknown(cause);
          opts.onError?.({
            error,
            path,
            type,
            ctx,
            req,
            input
          });
          respond({
            id,
            jsonrpc,
            error: getErrorShape({
              config: router2._def._config,
              error,
              type,
              path,
              input,
              ctx
            })
          });
          abortController2.abort();
        });
        clientSubscriptions.set(id, abortController2);
        respond({
          id,
          jsonrpc,
          result: {
            type: "started"
          }
        });
      }).catch((cause) => {
        const error = getTRPCErrorFromUnknown(cause);
        opts.onError?.({
          error,
          path,
          type,
          ctx,
          req,
          input
        });
        respond({
          id,
          jsonrpc,
          error: getErrorShape({
            config: router2._def._config,
            error,
            type,
            path,
            input,
            ctx
          })
        });
      });
    }
    client.on("message", (rawData) => {
      const msgStr = rawData.toString();
      if (msgStr === "PONG") {
        return;
      }
      if (msgStr === "PING") {
        if (!opts.dangerouslyDisablePong) {
          client.send("PONG");
        }
        return;
      }
      if (!ctxPromise) {
        ctxPromise = createCtxPromise(() => {
          let msg;
          try {
            msg = JSON.parse(msgStr);
            if (!isObject(msg)) {
              throw new Error("Message was not an object");
            }
          } catch (cause) {
            throw new TRPCError({
              code: "PARSE_ERROR",
              message: `Malformed TRPCConnectionParamsMessage`,
              cause
            });
          }
          const connectionParams = parseConnectionParamsFromUnknown(msg.data);
          return connectionParams;
        });
        return;
      }
      const parsedMsgs = run(() => {
        try {
          const msgJSON = JSON.parse(msgStr);
          const msgs = Array.isArray(msgJSON) ? msgJSON : [
            msgJSON
          ];
          return msgs.map((raw) => parseTRPCMessage(raw, transformer));
        } catch (cause) {
          const error = new TRPCError({
            code: "PARSE_ERROR",
            cause
          });
          respond({
            id: null,
            error: getErrorShape({
              config: router2._def._config,
              error,
              type: "unknown",
              path: void 0,
              input: void 0,
              ctx
            })
          });
          return [];
        }
      });
      parsedMsgs.map(handleRequest);
    });
    client.on("error", (cause) => {
      opts.onError?.({
        ctx,
        error: getTRPCErrorFromUnknown(cause),
        input: void 0,
        path: void 0,
        type: "unknown",
        req
      });
    });
    client.once("close", () => {
      for (const sub of clientSubscriptions.values()) {
        sub.abort();
      }
      clientSubscriptions.clear();
      abortController.abort();
    });
  };
}
function handleKeepAlive(client, pingMs = 3e4, pongWaitMs = 5e3) {
  let timeout = void 0;
  let ping = void 0;
  const schedulePing = () => {
    const scheduleTimeout = () => {
      timeout = setTimeout(() => {
        client.terminate();
      }, pongWaitMs);
    };
    ping = setTimeout(() => {
      client.send("PING");
      scheduleTimeout();
    }, pingMs);
  };
  const onMessage = () => {
    clearTimeout(ping);
    clearTimeout(timeout);
    schedulePing();
  };
  client.on("message", onMessage);
  client.on("close", () => {
    clearTimeout(ping);
    clearTimeout(timeout);
  });
  schedulePing();
}
function applyWSSHandler(opts) {
  const onConnection = getWSConnectionHandler(opts);
  opts.wss.on("connection", (client, req) => {
    if (opts.prefix && !req.url?.startsWith(opts.prefix)) {
      return;
    }
    onConnection(client, req);
  });
  return {
    broadcastReconnectNotification: () => {
      const response = {
        id: null,
        method: "reconnect"
      };
      const data = JSON.stringify(response);
      for (const client of opts.wss.clients) {
        if (client.readyState === WEBSOCKET_OPEN) {
          client.send(data);
        }
      }
    }
  };
}

// src/server.ts
import { WebSocketServer } from "ws";

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/middleware.mjs
var middlewareMarker = "middlewareMarker";
function createMiddlewareFactory() {
  function createMiddlewareInner(middlewares) {
    return {
      _middlewares: middlewares,
      unstable_pipe(middlewareBuilderOrFn) {
        const pipedMiddleware = "_middlewares" in middlewareBuilderOrFn ? middlewareBuilderOrFn._middlewares : [
          middlewareBuilderOrFn
        ];
        return createMiddlewareInner([
          ...middlewares,
          ...pipedMiddleware
        ]);
      }
    };
  }
  function createMiddleware(fn) {
    return createMiddlewareInner([
      fn
    ]);
  }
  return createMiddleware;
}
function createInputMiddleware(parse) {
  const inputMiddleware = async function inputValidatorMiddleware(opts) {
    let parsedInput;
    const rawInput = await opts.getRawInput();
    try {
      parsedInput = await parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        cause
      });
    }
    const combinedInput = isObject(opts.input) && isObject(parsedInput) ? {
      ...opts.input,
      ...parsedInput
    } : parsedInput;
    return opts.next({
      input: combinedInput
    });
  };
  inputMiddleware._type = "input";
  return inputMiddleware;
}
function createOutputMiddleware(parse) {
  const outputMiddleware = async function outputValidatorMiddleware({ next }) {
    const result = await next();
    if (!result.ok) {
      return result;
    }
    try {
      const data = await parse(result.data);
      return {
        ...result,
        data
      };
    } catch (cause) {
      throw new TRPCError({
        message: "Output validation failed",
        code: "INTERNAL_SERVER_ERROR",
        cause
      });
    }
  };
  outputMiddleware._type = "output";
  return outputMiddleware;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/vendor/standard-schema-v1/error.mjs
function _define_property3(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
var StandardSchemaV1Error = class extends Error {
  /**
  * Creates a schema error with useful information.
  *
  * @param issues The schema issues.
  */
  constructor(issues) {
    super(issues[0]?.message), /** The schema issues. */
    _define_property3(this, "issues", void 0);
    this.name = "SchemaError";
    this.issues = issues;
  }
};

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/parser.mjs
function getParseFn(procedureParser) {
  const parser = procedureParser;
  const isStandardSchema = "~standard" in parser;
  if (typeof parser === "function" && typeof parser.assert === "function") {
    return parser.assert.bind(parser);
  }
  if (typeof parser === "function" && !isStandardSchema) {
    return parser;
  }
  if (typeof parser.parseAsync === "function") {
    return parser.parseAsync.bind(parser);
  }
  if (typeof parser.parse === "function") {
    return parser.parse.bind(parser);
  }
  if (typeof parser.validateSync === "function") {
    return parser.validateSync.bind(parser);
  }
  if (typeof parser.create === "function") {
    return parser.create.bind(parser);
  }
  if (typeof parser.assert === "function") {
    return (value) => {
      parser.assert(value);
      return value;
    };
  }
  if (isStandardSchema) {
    return async (value) => {
      const result = await parser["~standard"].validate(value);
      if (result.issues) {
        throw new StandardSchemaV1Error(result.issues);
      }
      return result.value;
    };
  }
  throw new Error("Could not find a validator fn");
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/procedureBuilder.mjs
function createNewBuilder(def1, def2) {
  const { middlewares = [], inputs, meta, ...rest } = def2;
  return createBuilder({
    ...mergeWithoutOverrides(def1, rest),
    inputs: [
      ...def1.inputs,
      ...inputs ?? []
    ],
    middlewares: [
      ...def1.middlewares,
      ...middlewares
    ],
    meta: def1.meta && meta ? {
      ...def1.meta,
      ...meta
    } : meta ?? def1.meta
  });
}
function createBuilder(initDef = {}) {
  const _def = {
    procedure: true,
    inputs: [],
    middlewares: [],
    ...initDef
  };
  const builder = {
    _def,
    input(input) {
      const parser = getParseFn(input);
      return createNewBuilder(_def, {
        inputs: [
          input
        ],
        middlewares: [
          createInputMiddleware(parser)
        ]
      });
    },
    output(output) {
      const parser = getParseFn(output);
      return createNewBuilder(_def, {
        output,
        middlewares: [
          createOutputMiddleware(parser)
        ]
      });
    },
    meta(meta) {
      return createNewBuilder(_def, {
        meta
      });
    },
    use(middlewareBuilderOrFn) {
      const middlewares = "_middlewares" in middlewareBuilderOrFn ? middlewareBuilderOrFn._middlewares : [
        middlewareBuilderOrFn
      ];
      return createNewBuilder(_def, {
        middlewares
      });
    },
    unstable_concat(builder2) {
      return createNewBuilder(_def, builder2._def);
    },
    concat(builder2) {
      return createNewBuilder(_def, builder2._def);
    },
    query(resolver) {
      return createResolver({
        ..._def,
        type: "query"
      }, resolver);
    },
    mutation(resolver) {
      return createResolver({
        ..._def,
        type: "mutation"
      }, resolver);
    },
    subscription(resolver) {
      return createResolver({
        ..._def,
        type: "subscription"
      }, resolver);
    },
    experimental_caller(caller) {
      return createNewBuilder(_def, {
        caller
      });
    }
  };
  return builder;
}
function createResolver(_defIn, resolver) {
  const finalBuilder = createNewBuilder(_defIn, {
    resolver,
    middlewares: [
      async function resolveMiddleware(opts) {
        const data = await resolver(opts);
        return {
          marker: middlewareMarker,
          ok: true,
          data,
          ctx: opts.ctx
        };
      }
    ]
  });
  const _def = {
    ...finalBuilder._def,
    type: _defIn.type,
    experimental_caller: Boolean(finalBuilder._def.caller),
    meta: finalBuilder._def.meta,
    $types: null
  };
  const invoke = createProcedureCaller(finalBuilder._def);
  const callerOverride = finalBuilder._def.caller;
  if (!callerOverride) {
    return invoke;
  }
  const callerWrapper = async (...args) => {
    return await callerOverride({
      args,
      invoke,
      _def
    });
  };
  callerWrapper._def = _def;
  return callerWrapper;
}
var codeblock = `
This is a client-only function.
If you want to call this function on the server, see https://trpc.io/docs/v11/server/server-side-calls
`.trim();
async function callRecursive(index, _def, opts) {
  try {
    const middleware = _def.middlewares[index];
    const result = await middleware({
      ...opts,
      meta: _def.meta,
      input: opts.input,
      next(_nextOpts) {
        const nextOpts = _nextOpts;
        return callRecursive(index + 1, _def, {
          ...opts,
          ctx: nextOpts?.ctx ? {
            ...opts.ctx,
            ...nextOpts.ctx
          } : opts.ctx,
          input: nextOpts && "input" in nextOpts ? nextOpts.input : opts.input,
          getRawInput: nextOpts?.getRawInput ?? opts.getRawInput
        });
      }
    });
    return result;
  } catch (cause) {
    return {
      ok: false,
      error: getTRPCErrorFromUnknown(cause),
      marker: middlewareMarker
    };
  }
}
function createProcedureCaller(_def) {
  async function procedure2(opts) {
    if (!opts || !("getRawInput" in opts)) {
      throw new Error(codeblock);
    }
    const result = await callRecursive(0, _def, opts);
    if (!result) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "No result from middlewares - did you forget to `return next()`?"
      });
    }
    if (!result.ok) {
      throw result.error;
    }
    return result.data;
  }
  procedure2._def = _def;
  procedure2.procedure = true;
  return procedure2;
}

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/unstable-core-do-not-import/initTRPC.mjs
var TRPCBuilder = class _TRPCBuilder {
  /**
  * Add a context shape as a generic to the root object
  * @see https://trpc.io/docs/v11/server/context
  */
  context() {
    return new _TRPCBuilder();
  }
  /**
  * Add a meta shape as a generic to the root object
  * @see https://trpc.io/docs/v11/quickstart
  */
  meta() {
    return new _TRPCBuilder();
  }
  /**
  * Create the root object
  * @see https://trpc.io/docs/v11/server/routers#initialize-trpc
  */
  create(opts) {
    const config = {
      ...opts,
      transformer: getDataTransformer(opts?.transformer ?? defaultTransformer),
      isDev: opts?.isDev ?? // eslint-disable-next-line @typescript-eslint/dot-notation
      globalThis.process?.env["NODE_ENV"] !== "production",
      allowOutsideOfServer: opts?.allowOutsideOfServer ?? false,
      errorFormatter: opts?.errorFormatter ?? defaultFormatter,
      isServer: opts?.isServer ?? isServerDefault,
      /**
      * These are just types, they can't be used at runtime
      * @internal
      */
      $types: null
    };
    {
      const isServer = opts?.isServer ?? isServerDefault;
      if (!isServer && opts?.allowOutsideOfServer !== true) {
        throw new Error(`You're trying to use @trpc/server in a non-server environment. This is not supported by default.`);
      }
    }
    return {
      /**
      * Your router config
      * @internal
      */
      _config: config,
      /**
      * Builder object for creating procedures
      * @see https://trpc.io/docs/v11/server/procedures
      */
      procedure: createBuilder({
        meta: opts?.defaultMeta
      }),
      /**
      * Create reusable middlewares
      * @see https://trpc.io/docs/v11/server/middlewares
      */
      middleware: createMiddlewareFactory(),
      /**
      * Create a router
      * @see https://trpc.io/docs/v11/server/routers
      */
      router: createRouterFactory(config),
      /**
      * Merge Routers
      * @see https://trpc.io/docs/v11/server/merging-routers
      */
      mergeRouters,
      /**
      * Create a server-side caller for a router
      * @see https://trpc.io/docs/v11/server/server-side-calls
      */
      createCallerFactory: createCallerFactory()
    };
  }
};
var initTRPC = new TRPCBuilder();

// src/trpc.ts
var t = initTRPC.context().create();
var router = t.router;
var procedure = t.procedure;

// src/router/chat.ts
import { z } from "zod";
import { v4 as uuid } from "uuid";

// ../../node_modules/.pnpm/@trpc+server@11.1.2_typescript@5.8.3/node_modules/@trpc/server/dist/observable/operators.mjs
var distinctUnsetMarker = Symbol();

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  message: () => message,
  session: () => session
});
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
var session = sqliteTable("session", {
  id: text("id").primaryKey(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});
var message = sqliteTable("message", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => session.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

// src/router/chat.ts
var chatRouter = router({
  openSession: procedure.input(z.object({ model: z.string().default("gpt-4o") })).output(z.object({ sessionId: z.string() })).mutation(async ({ ctx, input }) => {
    const id = uuid();
    await ctx.db.insert(session).values({
      id,
      model: input.model,
      createdAt: /* @__PURE__ */ new Date()
    }).run();
    return { sessionId: id };
  }),
  userMessage: procedure.input(z.object({ sessionId: z.string(), content: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await ctx.db.insert(message).values({
      id: uuid(),
      sessionId: input.sessionId,
      role: "user",
      content: input.content,
      createdAt: /* @__PURE__ */ new Date()
    }).run();
    ctx.getAgent(input.sessionId, "gpt-4o").send({
      type: "USER_MSG",
      content: input.content
    });
  }),
  onToken: procedure.input(z.object({ sessionId: z.string() })).subscription(
    ({ ctx, input }) => observable((emit) => {
      const agent = ctx.getAgent(input.sessionId, "gpt-4o");
      const sub = agent.subscribe((ev) => {
        if (ev.type === "TOKEN") emit.next({ token: ev.token });
      });
      return () => sub.unsubscribe();
    })
  ),
  abort: procedure.input(z.object({ sessionId: z.string() })).mutation(({ ctx, input }) => {
    ctx.getAgent(input.sessionId, "gpt-4o").send("CANCEL");
  })
});

// src/router/_app.ts
var appRouter = router({ chat: chatRouter });

// src/db/client.ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
var sqlite = new Database(process.env.DB_URL ?? "./dev.db");
var db = drizzle(sqlite, { schema: schema_exports });
if (process.env.NODE_ENV !== "production") {
}

// src/context.ts
import { createActor } from "xstate";

// src/agents/agentMachine.ts
import { assign, sendParent, setup } from "xstate";

// src/llm/runner.ts
var LlmRunner = class {
  constructor(model) {
    this.model = model;
  }
  async *stream(_prompt, options) {
  }
  buffer() {
    return "";
  }
};

// src/agents/agentMachine.ts
var agentMachine = setup({
  types: {
    context: {},
    events: {}
  },
  actions: {
    storePrompt: assign({
      userPrompt: ({ event }) => event.type === "USER_MSG" ? event.content : void 0
    }),
    spawnLlmTask: assign(({ context }) => {
      const abort = new AbortController();
      runLlm(context, abort.signal);
      return { abortController: abort };
    })
    // abortLlm: (ctx) => ctx.abortController?.abort(),
  }
}).createMachine(
  {
    id: "agent",
    initial: "idle",
    context: {
      sessionId: "",
      model: "gpt-4o"
    },
    states: {
      idle: {
        on: {
          USER_MSG: {
            target: "thinking",
            actions: "storePrompt"
          }
        }
      },
      thinking: {
        entry: ["spawnLlmTask"],
        on: {
          LLM_DONE: "idle",
          CANCEL: {
            target: "idle"
            // actions: 'abortLlm',
          }
        }
      }
    }
  }
);
async function runLlm(ctx, signal) {
  const { sessionId, userPrompt = "", model } = ctx;
  const runner = new LlmRunner(model);
  for await (const token of runner.stream(userPrompt, { signal })) {
    sendParent({ type: "TOKEN", token, sessionId });
  }
  sendParent({ type: "LLM_DONE" });
}

// src/context.ts
var createContext = () => {
  const actors = /* @__PURE__ */ new Map();
  return {
    db,
    getAgent(sessionId, model) {
      if (!actors.has(sessionId)) {
        const actor = createActor(agentMachine, {
          input: { sessionId, model }
        }).start();
        actors.set(sessionId, actor);
      }
      return actors.get(sessionId);
    }
  };
};

// src/server.ts
var wss = new WebSocketServer({ port: 3001, path: "/trpc" });
applyWSSHandler({ wss, router: appRouter, createContext });
console.log("[api] ws://localhost:3001/trpc");
/*! Bundled license information:

@trpc/server/dist/unstable-core-do-not-import/router.mjs:
  (* istanbul ignore if -- @preserve *)

@trpc/server/dist/unstable-core-do-not-import/rpc/parseTRPCMessage.mjs:
@trpc/server/dist/adapters/ws.mjs:
  (* istanbul ignore next -- @preserve *)
*/
