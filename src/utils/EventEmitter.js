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
    this._listeners.get(event)?.delete(listener);
    return this;
  }

  /** @param {string} event @param {Function} listener — fires once then removes itself */
  once(event, listener) {
    const wrapper = (...args) => { listener(...args); this.off(event, wrapper); };
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
