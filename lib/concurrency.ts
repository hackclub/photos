type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type LimiterState = {
  active: number;
  waiters: Waiter[];
};

const limiterGlobal = globalThis as typeof globalThis & {
  __photosLimiterStates?: Map<string, LimiterState>;
};

function getLimiterState(key: string): LimiterState {
  let states = limiterGlobal.__photosLimiterStates;
  if (!states) {
    states = new Map();
    limiterGlobal.__photosLimiterStates = states;
  }
  const existing = states.get(key);
  if (existing) return existing;

  const state: LimiterState = { active: 0, waiters: [] };
  states.set(key, state);
  return state;
}

export function createLimiter(
  maxActive: number,
  maxQueued: number,
  label: string,
  key: string,
) {
  const state = getLimiterState(`photos:${key}`);

  function release() {
    state.active--;
    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift();
      if (!waiter || waiter.signal?.aborted) continue;
      if (waiter.onAbort) {
        waiter.signal?.removeEventListener("abort", waiter.onAbort);
      }
      state.active++;
      waiter.resolve();
      return;
    }
  }

  async function acquire(signal?: AbortSignal) {
    if (signal?.aborted) throw new Error(`${label} aborted`);
    if (state.active < maxActive) {
      state.active++;
      return;
    }
    if (state.waiters.length >= maxQueued) {
      throw new Error(`${label} is busy; retry later`);
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      waiter.onAbort = () => {
        const index = state.waiters.indexOf(waiter);
        if (index !== -1) state.waiters.splice(index, 1);
        reject(new Error(`${label} aborted`));
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      state.waiters.push(waiter);
    });
  }

  return async function withSlot<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ) {
    await acquire(signal);
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

export const withDirectUploadSlot = createLimiter(
  2,
  2,
  "Direct upload",
  "direct-upload",
);
export const withDataExportSlot = createLimiter(
  1,
  2,
  "Data export",
  "data-export",
);
export const withArchiveSlot = createLimiter(
  2,
  2,
  "Archive generation",
  "archive-generation",
);
