// Runs async tasks one after another (SPEC 2.3). A task that throws does not block the ones after it.
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

// Shared by every placement run: the Tasks page and the shell's Refresh.
export const placementQueue = createSerialQueue();
