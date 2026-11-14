import { AsyncLocalStorage } from 'node:async_hooks';

const sessionContext = new AsyncLocalStorage();

export function getSessionContext() {
  return sessionContext.getStore() || null;
}

export function runWithSessionContext(context, callback, ...args) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('A session context object is required.');
  }
  if (typeof callback !== 'function') {
    throw new TypeError('A session context callback is required.');
  }
  return sessionContext.run(Object.freeze({ ...context }), callback, ...args);
}

export function createContextualProxy({ getFallback, contextKey, bindMethods = true } = {}) {
  if (typeof getFallback !== 'function') throw new TypeError('getFallback must be a function.');
  if (typeof contextKey !== 'string' || !contextKey) throw new TypeError('contextKey must be a non-empty string.');

  function currentTarget() {
    const context = getSessionContext();
    return context && context[contextKey] !== undefined ? context[contextKey] : getFallback();
  }

  return new Proxy(Object.create(null), {
    get(_target, property) {
      const target = currentTarget();
      if (target == null) return undefined;
      const value = Reflect.get(target, property, target);
      return bindMethods && typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, property, value) {
      const target = currentTarget();
      if (target == null) throw new Error(`Cannot set ${String(property)} on an unavailable session context.`);
      return Reflect.set(target, property, value, target);
    },
    has(_target, property) {
      const target = currentTarget();
      return target != null && Reflect.has(target, property);
    },
    ownKeys() {
      const target = currentTarget();
      return target == null ? [] : Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_target, property) {
      const target = currentTarget();
      if (target == null) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    deleteProperty(_target, property) {
      const target = currentTarget();
      return target != null && Reflect.deleteProperty(target, property);
    },
  });
}

export function createSessionScopedMap() {
  const buckets = new Map();
  function bucket() {
    const id = getSessionContext()?.id || 'primary';
    let values = buckets.get(id);
    if (!values) {
      values = new Map();
      buckets.set(id, values);
    }
    return values;
  }
  return {
    get size() { return bucket().size; },
    get(key) { return bucket().get(key); },
    set(key, value) { bucket().set(key, value); return this; },
    has(key) { return bucket().has(key); },
    delete(key) {
      const values = bucket();
      const removed = values.delete(key);
      if (!values.size) buckets.delete(getSessionContext()?.id || 'primary');
      return removed;
    },
    clear() {
      buckets.delete(getSessionContext()?.id || 'primary');
    },
    keys() { return bucket().keys(); },
    values() { return bucket().values(); },
    entries() { return bucket().entries(); },
    forEach(callback, thisArg) { return bucket().forEach((value, key) => callback.call(thisArg, value, key, this)); },
    [Symbol.iterator]() { return this.entries(); },
  };
}

export function bindSessionEvent(socket, eventName, handler, context = {}) {
  if (!socket?.ev || typeof socket.ev.on !== 'function') {
    throw new TypeError('A WhatsApp socket with an event emitter is required.');
  }
  if (typeof eventName !== 'string' || !eventName || typeof handler !== 'function') {
    throw new TypeError('A valid event name and handler are required.');
  }
  socket.ev.on(eventName, (...args) => runWithSessionContext(
    { ...context, socket },
    () => handler(...args),
  ));
}
