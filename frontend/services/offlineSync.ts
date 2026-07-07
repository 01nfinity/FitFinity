import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Offline support for workout logging: exercises/templates/logs fetched from
// the server are cached here so they're still readable with no connection,
// and log create/update/delete calls that can't reach the server are queued
// here and replayed in order once connectivity returns.
//
// Locally-created (not yet synced) logs get a negative id -- this lets an
// edit or delete of a log that was itself created offline just mutate/cancel
// its still-queued 'create' action in place, instead of needing a real
// server id that doesn't exist yet.

const CACHE_EXERCISES_KEY = 'offline_cache_exercises';
const CACHE_TEMPLATES_KEY = 'offline_cache_templates';
const CACHE_LOGS_KEY = 'offline_cache_logs';
const QUEUE_KEY = 'offline_queue';

export type LogSetPayload = { exerciseName: string; weight: number; reps: number; completed: boolean };
export type LogPayload = { date: string; templateName: string; sentiment: number; sets: LogSetPayload[] };

type QueuedAction =
  | { id: string; type: 'create'; localId: number; payload: LogPayload; createdAt: number }
  | { id: string; type: 'update'; logId: number; payload: LogPayload; createdAt: number }
  | { id: string; type: 'delete'; logId: number; createdAt: number };

type Listener = () => void;
const listeners = new Set<Listener>();
function notifyListeners() {
  listeners.forEach(l => l());
}
export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: any) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// --- Read-through caches for exercises/templates/logs ---

export async function cacheExercises(data: any[]) {
  await writeJson(CACHE_EXERCISES_KEY, data);
}
export async function getCachedExercises(): Promise<any[]> {
  return readJson(CACHE_EXERCISES_KEY, []);
}

export async function cacheTemplates(data: any[]) {
  await writeJson(CACHE_TEMPLATES_KEY, data);
}
export async function getCachedTemplates(): Promise<any[]> {
  return readJson(CACHE_TEMPLATES_KEY, []);
}

export async function cacheLogs(data: any[]) {
  await writeJson(CACHE_LOGS_KEY, data);
}
export async function getCachedLogs(): Promise<any[]> {
  return readJson(CACHE_LOGS_KEY, []);
}

// --- Queue management ---

async function getQueue(): Promise<QueuedAction[]> {
  return readJson(QUEUE_KEY, []);
}
async function setQueue(queue: QueuedAction[]) {
  await writeJson(QUEUE_KEY, queue);
  notifyListeners();
}

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length;
}

// Merges the last-known server logs with the pending queue so the Log tab
// and Calendar/Stats screens see locally-created/edited/deleted entries
// immediately, without waiting for a sync.
export async function getMergedLogs(serverLogs: any[]): Promise<any[]> {
  const queue = await getQueue();
  let merged = [...serverLogs];

  for (const action of queue) {
    if (action.type === 'create') {
      merged = [{ id: action.localId, ...action.payload, sets: action.payload.sets.map((s, i) => ({ id: -(i + 1), ...s })), _pendingSync: true }, ...merged];
    } else if (action.type === 'update') {
      merged = merged.map(l => (l.id === action.logId ? { ...l, ...action.payload, sets: action.payload.sets.map((s, i) => ({ id: -(i + 1), ...s })), _pendingSync: true } : l));
    } else if (action.type === 'delete') {
      merged = merged.filter(l => l.id !== action.logId);
    }
  }
  return merged;
}

export async function queueCreateLog(payload: LogPayload): Promise<any> {
  const localId = -Date.now();
  const queue = await getQueue();
  queue.push({ id: `local-${localId}`, type: 'create', localId, payload, createdAt: Date.now() });
  await setQueue(queue);
  return { id: localId, ...payload, sets: payload.sets.map((s, i) => ({ id: -(i + 1), ...s })), _pendingSync: true };
}

export async function queueUpdateLog(logId: number, payload: LogPayload): Promise<any> {
  const queue = await getQueue();

  if (logId < 0) {
    // Editing a log that hasn't synced yet -- just rewrite its queued create.
    const idx = queue.findIndex(a => a.type === 'create' && a.localId === logId);
    if (idx !== -1) {
      queue[idx] = { ...(queue[idx] as any), payload };
    }
  } else {
    // Drop any earlier queued update for this log; only the latest matters.
    const withoutStaleUpdate = queue.filter(a => !(a.type === 'update' && a.logId === logId));
    withoutStaleUpdate.push({ id: `update-${logId}-${Date.now()}`, type: 'update', logId, payload, createdAt: Date.now() });
    await setQueue(withoutStaleUpdate);
    return { id: logId, ...payload, sets: payload.sets.map((s, i) => ({ id: -(i + 1), ...s })), _pendingSync: true };
  }

  await setQueue(queue);
  return { id: logId, ...payload, sets: payload.sets.map((s, i) => ({ id: -(i + 1), ...s })), _pendingSync: true };
}

export async function queueDeleteLog(logId: number): Promise<void> {
  const queue = await getQueue();

  if (logId < 0) {
    // Deleting a log that hasn't synced yet -- cancel out its queued create
    // (and drop any queued update targeting it, now moot).
    const filtered = queue.filter(a => !(a.type === 'create' && a.localId === logId));
    await setQueue(filtered);
    return;
  }

  // Drop any queued update for this log (about to be deleted anyway).
  const withoutUpdate = queue.filter(a => !(a.type === 'update' && a.logId === logId));
  withoutUpdate.push({ id: `delete-${logId}-${Date.now()}`, type: 'delete', logId, createdAt: Date.now() });
  await setQueue(withoutUpdate);
}

// --- Sync flush ---

let flushing = false;

// Injected by database/api.ts to avoid a circular import (api.ts calls into
// this module for caching/queueing; this module calls back into api.ts's
// raw network functions to actually replay the queue).
type RawLogApi = {
  createLog: (date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) => Promise<any>;
  updateLog: (id: number, date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) => Promise<any>;
  deleteLog: (id: number) => Promise<any>;
};

export async function flushQueue(rawApi: RawLogApi): Promise<{ synced: number; remaining: number }> {
  if (flushing) return { synced: 0, remaining: (await getQueue()).length };
  flushing = true;
  let synced = 0;

  try {
    let queue = await getQueue();

    while (queue.length > 0) {
      const action = queue[0];
      try {
        if (action.type === 'create') {
          await rawApi.createLog(action.payload.date, action.payload.templateName, action.payload.sentiment, action.payload.sets);
        } else if (action.type === 'update') {
          await rawApi.updateLog(action.logId, action.payload.date, action.payload.templateName, action.payload.sentiment, action.payload.sets);
        } else if (action.type === 'delete') {
          await rawApi.deleteLog(action.logId);
        }
        queue = queue.slice(1);
        await setQueue(queue);
        synced++;
      } catch (err: any) {
        // A genuine network failure (still offline) -- stop and retry later.
        // A server-side error (e.g. 404 for an update/delete whose target
        // log no longer exists) shouldn't block the rest of the queue
        // forever, so drop just that action and keep going.
        const isNetworkFailure = err?.message === 'Failed to fetch' || err?.name === 'TypeError';
        if (isNetworkFailure) break;
        console.warn('Dropping queued log action that the server rejected:', action, err);
        queue = queue.slice(1);
        await setQueue(queue);
      }
    }

    return { synced, remaining: queue.length };
  } finally {
    flushing = false;
  }
}

// Watches for the device coming back online and flushes the queue
// automatically. Call once from the root layout.
export function startConnectivityWatcher(rawApi: RawLogApi) {
  let wasOffline = false;
  return NetInfo.addEventListener(state => {
    const isOnline = !!state.isConnected && state.isInternetReachable !== false;
    if (!isOnline) {
      wasOffline = true;
    } else if (wasOffline) {
      wasOffline = false;
      flushQueue(rawApi).catch(err => console.warn('Auto-sync failed:', err));
    }
  });
}
