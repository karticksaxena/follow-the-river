/** The part of the Web Storage API the game uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveStore<T> {
  /** The saved value, or null when missing, corrupt, the wrong shape, or storage is blocked. */
  load(): T | null;
  /** True when the value was written. */
  save(value: T): boolean;
  clear(): void;
}

export const SAVE_PREFIX = 'kartiks-dreams:';

/** `localStorage`, or null when the browser blocks it (private mode, sandboxed iframe). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createSaveStore<T>(
  storage: StorageLike | null,
  key: string,
  isValid: (value: unknown) => value is T,
): SaveStore<T> {
  const fullKey = SAVE_PREFIX + key;
  return {
    load() {
      try {
        const raw = storage?.getItem(fullKey) ?? null;
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return isValid(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(value) {
      if (!storage) return false;
      try {
        storage.setItem(fullKey, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        storage?.removeItem(fullKey);
      } catch {
        // Storage is blocked; there is nothing to clear.
      }
    },
  };
}
