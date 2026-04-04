/**
 * Minimal, dependency-free EventEmitter.
 * Compatible with both browser and Node environments.
 */
export class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * @param {string}   event
   * @param {Function} listener
   */
  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return this;
  }

  /** @param {string} event @param {Function} listener */
  off(event, listener) {
    const bucket = this._listeners.get(event);
    if (!bucket) return this;
    // Match the stored listener directly OR its _original (once wrappers)
    for (const fn of bucket) {
      if (fn === listener || fn._original === listener) {
        bucket.delete(fn);
        break;
      }
    }
    return this;
  }

  /** @param {string} event @param {Function} listener — fires once then removes itself */
  once(event, listener) {
    const wrapper = (...args) => { listener(...args); this.off(event, wrapper); };
    wrapper._original = listener;
    return this.on(event, wrapper);
  }

  /** @param {string} event @param {*} payload */
  emit(event, payload) {
    this._listeners.get(event)?.forEach((fn) => fn(payload));
    return this;
  }

  removeAllListeners(event) {
    if (event) this._listeners.delete(event);
    else       this._listeners.clear();
    return this;
  }
}
