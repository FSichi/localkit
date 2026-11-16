// Minimal shared state: an observable store that React reads with a hook.
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(changes: Partial<T>): void;
  use(): T;
  /** For code outside React. Returns the way to stop listening. */
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    get: () => value,
    set(changes) {
      value = { ...value, ...changes };
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
    subscribe,
  };
}
