import { createJSONStorage, type PersistStorage, type StorageValue } from "zustand/middleware";

/**
 * Creates a PersistStorage adapter that debounces setItem calls.
 * Wraps at the PersistStorage level so both JSON serialization and
 * localStorage writes are skipped during the debounce window.
 *
 * Flushes pending writes on beforeunload and visibilitychange (hidden)
 * to prevent data loss.
 */
export function createDebouncedStorage<S>(delay = 1000): PersistStorage<S> {
  const baseStorage = createJSONStorage<S>(() => localStorage)!;

  let pendingWrite: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingWrite) {
      baseStorage.setItem(pendingWrite.name, pendingWrite.value);
      pendingWrite = null;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
  }

  return {
    getItem: (name) => baseStorage.getItem(name),
    removeItem: (name) => baseStorage.removeItem(name),
    setItem(name, value) {
      pendingWrite = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
  };
}
