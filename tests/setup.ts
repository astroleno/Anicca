import "@testing-library/jest-dom/vitest";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}

if (typeof window !== "undefined") {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: sessionStorage
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorage
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorage
  });
}
