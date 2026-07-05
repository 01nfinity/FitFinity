import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

async function getHeaders() {
  const token = Platform.OS === 'web' ? localStorage.getItem('userToken') : await SecureStore.getItemAsync('userToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function fetchExercises() {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/exercises`, { headers });
  if (!response.ok) throw new Error('Failed to fetch exercises');
  return response.json();
}

export async function createExercise(data: { name: string, categories?: string[], description?: string, isGlobal?: boolean, imageUrl?: string, image?: any }) {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('categories', JSON.stringify(data.categories || []));
  if (data.description) formData.append('description', data.description);
  if (data.isGlobal !== undefined) formData.append('isGlobal', data.isGlobal.toString());
  formData.append('imageUrl', data.imageUrl || '');

  if (data.image) {
    formData.append('image', {
      uri: data.image.uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);
  }

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

export async function updateExercise(id: number, data: { name: string, categories?: string[], description?: string, isGlobal?: boolean, imageUrl?: string, image?: any }) {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('categories', JSON.stringify(data.categories || []));
  if (data.description) formData.append('description', data.description);
  if (data.isGlobal !== undefined) formData.append('isGlobal', data.isGlobal.toString());
  formData.append('imageUrl', data.imageUrl || '');

  if (data.image) {
    formData.append('image', {
      uri: data.image.uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);
  }

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

export async function fetchTemplates() {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates`, { headers });
  if (!response.ok) throw new Error('Failed to fetch templates');
  return response.json();
}

export async function fetchTemplate(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch template');
  return response.json();
}

export async function createTemplate(name: string, description: string, exercises: any[], isGlobal?: boolean) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, exercises, isGlobal })
  });
  if (!response.ok) throw new Error('Failed to create template');
  return response.json();
}

export async function updateTemplate(id: number, name: string, description: string, exercises: any[], isGlobal?: boolean) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, exercises, isGlobal })
  });
  if (!response.ok) throw new Error('Failed to update template');
  return response.json();
}

export async function fetchLogs() {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs`, { headers });
  if (!response.ok) throw new Error('Failed to fetch logs');
  return response.json();
}

export async function fetchLog(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch log');
  return response.json();
}

type LogSetPayload = { exerciseName: string; weight: number; reps: number; completed: boolean };

export async function createLog(date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, templateName, sentiment, sets })
  });
  if (!response.ok) throw new Error('Failed to create log');
  return response.json();
}

export async function updateLog(id: number, date: string, templateName: string, sentiment: number, sets: LogSetPayload[]) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, templateName, sentiment, sets })
  });
  if (!response.ok) throw new Error('Failed to update log');
  return response.json();
}

export async function deleteLog(id: number) {
  const headers = await getHeaders();
  const response = await fetch(`${API_BASE_URL}/logs/${id}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error('Failed to delete log');
  return response.json();
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
