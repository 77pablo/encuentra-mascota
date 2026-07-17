// Caché en memoria con vencimiento. Recibe un `now` inyectable para poder
// probar el vencimiento sin depender del reloj real.
export interface Cache<T> {
  get(): T | null;
  set(value: T): void;
  clear(): void;
}

export function ttlCache<T>(ttlMs: number, now: () => number = () => Date.now()): Cache<T> {
  let value: T | null = null;
  let savedAt = 0;
  return {
    get() {
      if (value === null) return null;
      if (now() - savedAt > ttlMs) {
        value = null;
        return null;
      }
      return value;
    },
    set(v: T) {
      value = v;
      savedAt = now();
    },
    clear() {
      value = null;
    },
  };
}
