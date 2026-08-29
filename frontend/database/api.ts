import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as offlineSync from '../services/offlineSync';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

async function getHeaders() {
  const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// fetch() throws a TypeError when it can't reach the network at all (no
// connectivity), on both web ("Failed to fetch") and native ("Network
// request failed") -- as opposed to a reachable server responding with an
// error status, which callers handle themselves via `response.ok`. Only the
// former should fall back to the offline cache/queue.
function isNetworkError(err: any): boolean {
  return err instanceof TypeError;
}

// The offline write-queue (silently save locally + report success, replay
// later) is only safe on native: AsyncStorage there is durable app storage
// that survives backgrounding, matching the "gym with bad signal" scenario
// it exists for. On web the equivalent storage is one browser tab's local
// storage -- routinely gone the moment the tab closes -- and an image pick
// there is a `blob:` URL scoped to that same tab, which can never be
// re-uploaded once it's gone. Queuing on web means a flaky connection can
// silently swallow a save (shown as "Success") with no real way to recover
// it. So on web, a write that can't reach the network throws for real
// instead of queuing -- matches the pre-offline-sync behavior there.
const canQueueWritesOffline = Platform.OS !== 'web';

// Native's fetch polyfill accepts a plain {uri, type, name} object for file
// uploads, but a real browser's FormData.append requires an actual Blob/File
// -- a plain object just gets stringified to "[object Object]" and no image
// data is ever sent. On web we fetch the picked asset's local uri (a blob:
// or data: URL) back into a real Blob first.
async function appendImageToFormData(formData: FormData, image: any) {
  if (!image) return;
  if (Platform.OS === 'web') {
    const response = await fetch(image.uri);
    const blob = await response.blob();
    formData.append('image', blob, 'upload.jpg');
  } else {
    formData.append('image', {
      uri: image.uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);
  }
}

export async function fetchExercises() {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/exercises`, { headers });
    if (!response.ok) throw new Error('Failed to fetch exercises');
    const data = await response.json();
    await offlineSync.cacheExercises(data);
    offlineSync.setOnline();
    return offlineSync.getMergedExercises(data);
  } catch (err) {
    if (isNetworkError(err)) {
      offlineSync.setOffline();
      return offlineSync.getMergedExercises(await offlineSync.getCachedExercises());
    }
    throw err;
  }
}

type ExercisePayload = { name: string, categories?: string[], description?: string, isGlobal?: boolean, imageUrl?: string, image?: any };

// A pending exercise (not yet synced) previews with its local device image
// uri in place of `imageUrl` (see offlineSync's exerciseFromPayload) so the
// UI has something to render. If that same exercise is edited again before
// it syncs, the editor round-trips that local uri back through `imageUrl`
// unchanged -- which would otherwise get sent to the server as if it were a
// pasted external URL, corrupting the record. Detect that case and route it
// through `image` (a real re-upload) instead.
function isLocalDeviceUri(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) && !/^https?:/i.test(uri);
}

function normalizeExercisePayload(data: ExercisePayload): ExercisePayload {
  if (!data.image && data.imageUrl && isLocalDeviceUri(data.imageUrl)) {
    return { ...data, image: { uri: data.imageUrl }, imageUrl: '' };
  }
  return data;
}

async function rawCreateExercise(data: ExercisePayload) {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('categories', JSON.stringify(data.categories || []));
  if (data.description) formData.append('description', data.description);
  if (data.isGlobal !== undefined) formData.append('isGlobal', data.isGlobal.toString());
  formData.append('imageUrl', data.imageUrl || '');
  await appendImageToFormData(formData, data.image);

  const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
  const response = await fetch(`${API_BASE_URL}/exercises`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type manually: fetch must generate the multipart boundary itself.
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) throw new Error('Failed to create exercise');
  return response.json();
}

async function rawUpdateExercise(id: number, data: ExercisePayload) {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('categories', JSON.stringify(data.categories || []));
  if (data.description) formData.append('description', data.description);
  if (data.isGlobal !== undefined) formData.append('isGlobal', data.isGlobal.toString());
  formData.append('imageUrl', data.imageUrl || '');
  await appendImageToFormData(formData, data.image);

  const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
  const response = await fetch(`${API_BASE_URL}/exercises/${id}`, {
    method: 'PUT',
    body: formData,
    // Don't set Content-Type manually: fetch must generate the multipart boundary itself.
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) throw new Error('Failed to update exercise');
  return response.json();
}

// createExercise/updateExercise are the offline-aware versions every screen
// calls: if the network is unreachable, the action (including a locally
// picked image, re-uploaded from its device file uri) is queued instead of
// throwing, and gets replayed once connectivity returns -- same pattern as
// createLog/updateLog below.
export async function createExercise(data: ExercisePayload) {
  data = normalizeExercisePayload(data);
  try {
    return await rawCreateExercise(data);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueCreateExercise(data);
    throw err;
  }
}

export async function updateExercise(id: number, data: ExercisePayload) {
  data = normalizeExercisePayload(data);
  if (id < 0) return offlineSync.queueUpdateExercise(id, data);
  try {
    return await rawUpdateExercise(id, data);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueUpdateExercise(id, data);
    throw err;
  }
}

export async function fetchTemplates() {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/templates`, { headers });
    if (!response.ok) throw new Error('Failed to fetch templates');
    const data = await response.json();
    await offlineSync.cacheTemplates(data);
    offlineSync.setOnline();
    return offlineSync.getMergedTemplates(data);
  } catch (err) {
    if (isNetworkError(err)) {
      offlineSync.setOffline();
      return offlineSync.getMergedTemplates(await offlineSync.getCachedTemplates());
    }
    throw err;
  }
}

export async function fetchTemplate(id: number) {
  // Negative ids only ever exist locally (see offlineSync) -- never hit the network for them.
  if (id < 0) {
    const merged = await offlineSync.getMergedTemplates(await offlineSync.getCachedTemplates());
    const match = merged.find((t: any) => t.id === id);
    if (match) return match;
    throw new Error('Template not found locally');
  }
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/templates/${id}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch template');
    return response.json();
  } catch (err) {
    if (isNetworkError(err)) {
      const merged = await offlineSync.getMergedTemplates(await offlineSync.getCachedTemplates());
      const match = merged.find((t: any) => t.id === id);
      if (match) return match;
    }
    throw err;
  }
}

type TemplateExercisePayload = { name: string, sets: number, repsString: string, weight: number };

async function rawCreateTemplate(payload: { name: string, description: string, exercises: TemplateExercisePayload[], isGlobal?: boolean }) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to create template');
  return response.json();
}

async function rawUpdateTemplate(id: number, payload: { name: string, description: string, exercises: TemplateExercisePayload[], isGlobal?: boolean }) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to update template');
  return response.json();
}

async function rawDeleteTemplate(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete template');
  return response.json();
}

// createTemplate/updateTemplate/deleteTemplate are the offline-aware
// versions every screen calls -- same queue-on-network-failure pattern as
// createLog/updateLog/deleteLog below. A template created or edited offline
// gets a negative id (or mutates its still-queued create) exactly like logs.
export async function createTemplate(name: string, description: string, exercises: TemplateExercisePayload[], isGlobal?: boolean) {
  const payload = { name, description, exercises, isGlobal };
  try {
    return await rawCreateTemplate(payload);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueCreateTemplate(payload);
    throw err;
  }
}

export async function updateTemplate(id: number, name: string, description: string, exercises: TemplateExercisePayload[], isGlobal?: boolean) {
  const payload = { name, description, exercises, isGlobal };
  if (id < 0) return offlineSync.queueUpdateTemplate(id, payload);
  try {
    return await rawUpdateTemplate(id, payload);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueUpdateTemplate(id, payload);
    throw err;
  }
}

export async function deleteTemplate(id: number) {
  if (id < 0) return offlineSync.queueDeleteTemplate(id);
  try {
    return await rawDeleteTemplate(id);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueDeleteTemplate(id);
    throw err;
  }
}

export async function fetchLogs() {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/logs`, { headers });
    if (!response.ok) throw new Error('Failed to fetch logs');
    const data = await response.json();
    await offlineSync.cacheLogs(data);
    offlineSync.setOnline();
    return offlineSync.getMergedLogs(data);
  } catch (err) {
    if (isNetworkError(err)) {
      offlineSync.setOffline();
      return offlineSync.getMergedLogs(await offlineSync.getCachedLogs());
    }
    throw err;
  }
}

export async function fetchLog(id: number) {
  // Negative ids only ever exist locally (see offlineSync) -- never hit the network for them.
  if (id < 0) {
    const merged = await offlineSync.getMergedLogs(await offlineSync.getCachedLogs());
    const match = merged.find((l: any) => l.id === id);
    if (match) return match;
    throw new Error('Log not found locally');
  }
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/logs/${id}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch log');
    return response.json();
  } catch (err) {
    if (isNetworkError(err)) {
      const merged = await offlineSync.getMergedLogs(await offlineSync.getCachedLogs());
      const match = merged.find((l: any) => l.id === id);
      if (match) return match;
    }
    throw err;
  }
}

type LogSetPayload = { exerciseName: string; weight: number; reps: number; completed: boolean };

async function rawCreateLog(date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, templateName, sentiment, sets })
  });
  if (!response.ok) throw new Error('Failed to create log');
  return response.json();
}

async function rawUpdateLog(id: number, date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, templateName, sentiment, sets })
  });
  if (!response.ok) throw new Error('Failed to update log');
  return response.json();
}

async function rawDeleteLog(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs/${id}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete log');
  return response.json();
}

// createLog/updateLog/deleteLog are the offline-aware versions every screen
// calls: if the network is unreachable, the action is queued locally (see
// services/offlineSync.ts) instead of throwing, and gets replayed against
// the server automatically once connectivity returns (see startOfflineSync
// below) or the next time syncNow() runs.
export async function createLog(date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  try {
    return await rawCreateLog(date, templateName, sentiment, sets);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueCreateLog({ date, templateName, sentiment, sets });
    throw err;
  }
}

export async function updateLog(id: number, date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  if (id < 0) return offlineSync.queueUpdateLog(id, { date, templateName, sentiment, sets });
  try {
    return await rawUpdateLog(id, date, templateName, sentiment, sets);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueUpdateLog(id, { date, templateName, sentiment, sets });
    throw err;
  }
}

export async function deleteLog(id: number) {
  if (id < 0) return offlineSync.queueDeleteLog(id);
  try {
    return await rawDeleteLog(id);
  } catch (err) {
    if (canQueueWritesOffline && isNetworkError(err)) return offlineSync.queueDeleteLog(id);
    throw err;
  }
}

// The full set of raw (network-only) mutators the sync queue replays
// against once connectivity returns -- covers logs, templates, and
// exercises so a single queue/"Sync Now" covers every part of the app.
const rawSyncApi = {
  createLog: rawCreateLog,
  updateLog: rawUpdateLog,
  deleteLog: rawDeleteLog,
  createTemplate: rawCreateTemplate,
  updateTemplate: rawUpdateTemplate,
  deleteTemplate: rawDeleteTemplate,
  createExercise: rawCreateExercise,
  updateExercise: rawUpdateExercise,
};

// Attempts to replay any queued offline actions (logs, templates,
// exercises) now; returns how many synced vs. are still pending (e.g.
// because the network dropped again mid-sync). Safe to call anytime,
// including while already online with an empty queue.
export async function syncNow() {
  return offlineSync.flushQueue(rawSyncApi);
}

export async function getPendingSyncCount() {
  return offlineSync.getPendingCount();
}

// Whether the most recent read fell back to cached data because the network
// was unreachable -- lets screens show "you're offline" even with nothing
// queued to sync.
export function getIsOffline() {
  return offlineSync.getIsOffline();
}

export function subscribeSyncStatus(listener: () => void) {
  return offlineSync.subscribe(listener);
}

// Watches for the device coming back online and auto-syncs the offline
// queue. Call once, near app startup (see app/_layout.tsx).
export function startOfflineSync() {
  return offlineSync.startConnectivityWatcher(rawSyncApi);
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to login');
  }
  return response.json();
}

export async function register(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to register');
  }
  return response.json();
}

export async function fetchAdminUsers() {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/admin/users`, { headers });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
}

export async function updateUserAdmin(id: number, isAdmin: boolean) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isAdmin })
  });
  if (!response.ok) throw new Error('Failed to update user');
  return response.json();
}

export async function deleteUser(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete user');
  return response.json();
}

// Any authenticated user may call this for their own id; only admins may
// target another user's id (the backend enforces this too).
export async function resetPassword(userId: number, newPassword: string) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/users/${userId}/password`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update password');
  }
  return response.json();
}
