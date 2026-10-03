import { describe, expect, it } from 'vitest';
import { createSaveStore, SAVE_PREFIX, type StorageLike } from './save';

interface Counter {
  count: number;
}

const isCounter = (value: unknown): value is Counter =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { count?: unknown }).count === 'number';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('createSaveStore', () => {
  it('round-trips a valid value under the game prefix', () => {
    const storage = memoryStorage();
    const store = createSaveStore(storage, 'test', isCounter);
    expect(store.save({ count: 3 })).toBe(true);
    expect(storage.data.has(`${SAVE_PREFIX}test`)).toBe(true);
    expect(store.load()).toEqual({ count: 3 });
  });

  it('returns null when nothing is saved', () => {
    expect(createSaveStore(memoryStorage(), 'test', isCounter).load()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const storage = memoryStorage();
    storage.data.set(`${SAVE_PREFIX}test`, '{not json');
    expect(createSaveStore(storage, 'test', isCounter).load()).toBeNull();
  });

  it('returns null for data of the wrong shape', () => {
    const storage = memoryStorage();
    storage.data.set(`${SAVE_PREFIX}test`, '{"count":"five"}');
    expect(createSaveStore(storage, 'test', isCounter).load()).toBeNull();
  });

  it('never throws when storage throws', () => {
    const store = createSaveStore(throwingStorage, 'test', isCounter);
    expect(store.load()).toBeNull();
    expect(store.save({ count: 1 })).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('works when there is no storage at all', () => {
    const store = createSaveStore<Counter>(null, 'test', isCounter);
    expect(store.load()).toBeNull();
    expect(store.save({ count: 1 })).toBe(false);
  });
});
