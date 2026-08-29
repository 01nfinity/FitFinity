import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Offline support for logs, templates, and exercises: data fetched from the
// server is cached here so it's still readable with no connection, and
// create/update/delete calls that can't reach the server are queued here and
// replayed in order once connectivity returns.
//
// Locally-created (not yet synced) rows get a negative id (real server ids
// are always positive) -- this lets an edit or delete of a row that was
// itself created offline just mutate/cancel its still-queued 'create' action
// in place, instead of needing a real server id that doesn't exist yet.

const CACHE_EXERCISES_KEY = 'offline_cache_exercises';
const CACHE_TEMPLATES_KEY = 'offline_cache_templates';
const CACHE_LOGS_KEY = 'offline_cache_logs';
const QUEUE_KEY = 'offline_queue';

export type LogSetPayload = { exerciseName: string; weight: number; reps: number; completed: boolean };
export type LogPayload = { date: string; templateName: string; sentiment: number; sets: LogSetPayload[] };

export type TemplateExercisePayload = { name: string; sets: number; repsString: string; weight: number };
export type TemplatePayload = { name: string; description: string; exercises: TemplateExercisePayload[]; isGlobal?: boolean };

export type ExercisePayload = {
  name: string;
  categories?: string[];
  description?: string;
  isGlobal?: boolean;
  imageUrl?: string;
  // A locally-picked-but-not-yet-uploaded image. Only `uri` is used when
  // rebuilding the upload at sync time.
  image?: { uri: string } | null;
};

type QueuedAction =
  | { id: string; type: 'create'; localId: number; payload: LogPayload; createdAt: number }
  | { id: string; type: 'update'; logId: number; payload: LogPayload; createdAt: number }
  | { id: string; type: 'delete'; logId: number; createdAt: number }
  | { id: string; type: 'template-create'; localId: number; payload: TemplatePayload; createdAt: number }
  | { id: string; type: 'template-update'; templateId: number; payload: TemplatePayload; createdAt: number }
  | { id: string; type: 'template-delete'; templateId: number; createdAt: number }
  | { id: string; type: 'exercise-create'; localId: number; payload: ExercisePayload; createdAt: number }
  | { id: string; type: 'exercise-update'; exerciseId: number; payload: ExercisePayload; createdAt: number };

type Listener = () => void;
const listeners = new Set<Listener>();
function notifyListeners() {
  listeners.forEach(l => l());
}
export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Whether the most recent network-backed fetch failed to reach the server at
// all (as opposed to the server returning an error). Screens use this to
// show "you're offline, viewing cached data" even when there's nothing
// queued to sync. In-memory only -- resets to "online" on every cold start,
// which is fine since the next fetch re-derives the real state immediately.
let offline = false;
export function getIsOffline() {
  return offline;
}
export function setOnline() {
  if (offline) {
    offline = false;
    notifyListeners();
  }
}
export function setOffline() {
  if (!offline) {
    offline = true;
    notifyListeners();
  }
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

function templateFromPayload(id: number, payload: TemplatePayload) {
  return {
    id,
    name: payload.name,
    description: payload.description,
    isGlobal: !!payload.isGlobal,
    exercises: payload.exercises.map((e, i) => ({
      id: -(i + 1),
      exerciseName: e.name,
      targetSets: e.sets,
      targetReps: e.repsString,
      targetWeight: e.weight,
    })),
    _pendingSync: true,
  };
}

// Same idea as getMergedLogs, for the Templates tab -- queued
// creates/edits/deletes made offline show up immediately, marked `_pendingSync`.
export async function getMergedTemplates(serverTemplates: any[]): Promise<any[]> {
  const queue = await getQueue();
  let merged = [...serverTemplates];

  for (const action of queue) {
    if (action.type === 'template-create') {
      merged = [templateFromPayload(action.localId, action.payload), ...merged];
    } else if (action.type === 'template-update') {
      merged = merged.map(t => (t.id === action.templateId ? { ...t, ...templateFromPayload(action.templateId, action.payload) } : t));
    } else if (action.type === 'template-delete') {
      merged = merged.filter(t => t.id !== action.templateId);
    }
  }
  return merged;
}

function exerciseFromPayload(id: number, payload: ExercisePayload, existing?: any) {
  return {
    ...(existing || {}),
    id,
    name: payload.name,
    description: payload.description || '',
    categories: payload.categories || [],
    isGlobal: !!payload.isGlobal,
    // A freshly-picked image previews from its local file uri directly; an
    // explicit imageUrl (including "" to clear it) otherwise wins, falling
    // back to whatever the row already had.
    imageUrl: payload.image ? payload.image.uri : (payload.imageUrl !== undefined ? (payload.imageUrl || null) : (existing?.imageUrl ?? null)),
    _pendingSync: true,
  };
}

// Same idea, for the Exercise Library tab. There's no offline delete for
// exercises since the app has no delete-exercise action to begin with.
export async function getMergedExercises(serverExercises: any[]): Promise<any[]> {
  const queue = await getQueue();
  let merged = [...serverExercises];

  for (const action of queue) {
    if (action.type === 'exercise-create') {
      merged = [exerciseFromPayload(action.localId, action.payload), ...merged];
    } else if (action.type === 'exercise-update') {
      merged = merged.map(e => (e.id === action.exerciseId ? exerciseFromPayload(action.exerciseId, action.payload, e) : e));
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

export async function queueCreateTemplate(payload: TemplatePayload): Promise<any> {
  const localId = -Date.now();
  const queue = await getQueue();
  queue.push({ id: `local-tmpl-${localId}`, type: 'template-create', localId, payload, createdAt: Date.now() });
  await setQueue(queue);
  return templateFromPayload(localId, payload);
}

export async function queueUpdateTemplate(templateId: number, payload: TemplatePayload): Promise<any> {
  const queue = await getQueue();

  if (templateId < 0) {
    const idx = queue.findIndex(a => a.type === 'template-create' && a.localId === templateId);
    if (idx !== -1) {
      queue[idx] = { ...(queue[idx] as any), payload };
    }
  } else {
    const withoutStale = queue.filter(a => !(a.type === 'template-update' && a.templateId === templateId));
    withoutStale.push({ id: `tmpl-update-${templateId}-${Date.now()}`, type: 'template-update', templateId, payload, createdAt: Date.now() });
    await setQueue(withoutStale);
    return templateFromPayload(templateId, payload);
  }

  await setQueue(queue);
  return templateFromPayload(templateId, payload);
}

export async function queueDeleteTemplate(templateId: number): Promise<void> {
  const queue = await getQueue();

  if (templateId < 0) {
    const filtered = queue.filter(a => !(a.type === 'template-create' && a.localId === templateId));
    await setQueue(filtered);
    return;
  }

  const withoutUpdate = queue.filter(a => !(a.type === 'template-update' && a.templateId === templateId));
  withoutUpdate.push({ id: `tmpl-delete-${templateId}-${Date.now()}`, type: 'template-delete', templateId, createdAt: Date.now() });
  await setQueue(withoutUpdate);
}

export async function queueCreateExercise(payload: ExercisePayload): Promise<any> {
  const localId = -Date.now();
  const queue = await getQueue();
  queue.push({ id: `local-ex-${localId}`, type: 'exercise-create', localId, payload, createdAt: Date.now() });
  await setQueue(queue);
  return exerciseFromPayload(localId, payload);
}

export async function queueUpdateExercise(exerciseId: number, payload: ExercisePayload): Promise<any> {
  const queue = await getQueue();

  if (exerciseId < 0) {
    const idx = queue.findIndex(a => a.type === 'exercise-create' && a.localId === exerciseId);
    if (idx !== -1) {
      queue[idx] = { ...(queue[idx] as any), payload };
    }
  } else {
    const withoutStale = queue.filter(a => !(a.type === 'exercise-update' && a.exerciseId === exerciseId));
    withoutStale.push({ id: `ex-update-${exerciseId}-${Date.now()}`, type: 'exercise-update', exerciseId, payload, createdAt: Date.now() });
    await setQueue(withoutStale);
    return exerciseFromPayload(exerciseId, payload);
  }

  await setQueue(queue);
  return exerciseFromPayload(exerciseId, payload);
}

// --- Sync flush ---

let flushing = false;

// Injected by database/api.ts to avoid a circular import (api.ts calls into
// this module for caching/queueing; this module calls back into api.ts's
// raw network functions to actually replay the queue).
type RawApi = {
  createLog: (date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) => Promise<any>;
  updateLog: (id: number, date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) => Promise<any>;
  deleteLog: (id: number) => Promise<any>;
  createTemplate: (payload: TemplatePayload) => Promise<any>;
  updateTemplate: (id: number, payload: TemplatePayload) => Promise<any>;
  deleteTemplate: (id: number) => Promise<any>;
  createExercise: (payload: ExercisePayload) => Promise<any>;
  updateExercise: (id: number, payload: ExercisePayload) => Promise<any>;
};

export async function flushQueue(rawApi: RawApi): Promise<{ synced: number; remaining: number }> {
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
        } else if (action.type === 'template-create') {
          await rawApi.createTemplate(action.payload);
        } else if (action.type === 'template-update') {
          await rawApi.updateTemplate(action.templateId, action.payload);
        } else if (action.type === 'template-delete') {
          await rawApi.deleteTemplate(action.templateId);
        } else if (action.type === 'exercise-create') {
          await rawApi.createExercise(action.payload);
        } else if (action.type === 'exercise-update') {
          await rawApi.updateExercise(action.exerciseId, action.payload);
        }
        queue = queue.slice(1);
        await setQueue(queue);
        synced++;
      } catch (err: any) {
        // A genuine network failure (still offline) -- stop and retry later.
        // A server-side error (e.g. 404 for an update/delete whose target
        // row no longer exists, or a locally-cached image file that's no
        // longer on disk) shouldn't block the rest of the queue forever, so
        // drop just that action and keep going.
        const isNetworkFailure = err?.message === 'Failed to fetch' || err?.name === 'TypeError';
        if (isNetworkFailure) break;
        console.warn('Dropping queued sync action that failed:', action, err);
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
export function startConnectivityWatcher(rawApi: RawApi) {
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
