import "server-only";

const globalForRefresh = globalThis as typeof globalThis & {
  __goalMindRefreshState?: {
    running: boolean;
    startedAt?: string;
    lastCompletedAt?: string;
    lastError?: string;
  };
};

export function getRefreshState() {
  if (!globalForRefresh.__goalMindRefreshState) {
    globalForRefresh.__goalMindRefreshState = { running: false };
  }
  return globalForRefresh.__goalMindRefreshState;
}

export function startRefresh() {
  const state = getRefreshState();
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.lastError = undefined;
}

export function finishRefresh(error?: unknown) {
  const state = getRefreshState();
  state.running = false;
  state.lastCompletedAt = new Date().toISOString();
  if (error) state.lastError = String(error);
}
