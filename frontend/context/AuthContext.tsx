import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import { Platform } from 'react-native';

type AuthContextType = {
  token: string | null;
  userId: number | null;
  username: string | null;
  isAdmin: boolean;
  signIn: (token: string, userId: number, username: string, isAdmin: boolean) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const setStorageItem = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getStorageItem = async (key: string) => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

const removeStorageItem = async (key: string) => {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    async function loadToken() {
      try {
        const storedToken = await getStorageItem('userToken');
        const storedUserId = await getStorageItem('userId');
        const storedUsername = await getStorageItem('username');
        const storedIsAdmin = await getStorageItem('isAdmin');
        if (storedToken) {
          setToken(storedToken);
          setUserId(storedUserId ? parseInt(storedUserId) : null);
          setUsername(storedUsername);
          setIsAdmin(storedIsAdmin === 'true');
        }
      } catch (e) {
        console.error("Failed to load token", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // Only steer between the login screen and the app; leave every other
    // authenticated route (exercise-editor, template-editor, active-workout, etc.)
    // alone so navigating to them doesn't get bounced back to the tabs.
    const onLoginScreen = segments[0] === 'login';

    if (!token && !onLoginScreen) {
      router.replace('/login');
    } else if (token && onLoginScreen) {
      router.replace('/(tabs)/');
    }
  }, [token, segments, isLoading]);

  const signIn = async (newToken: string, newUserId: number, newUsername: string, newIsAdmin: boolean = false) => {
    setToken(newToken);
    setUserId(newUserId);
    setUsername(newUsername);
    setIsAdmin(newIsAdmin);
    await setStorageItem('userToken', newToken);
    await setStorageItem('userId', newUserId.toString());
    await setStorageItem('username', newUsername);
    await setStorageItem('isAdmin', newIsAdmin.toString());
  };

  const signOut = async () => {
    setToken(null);
    setUserId(null);
    setUsername(null);
    setIsAdmin(false);
    await removeStorageItem('userToken');
    await removeStorageItem('userId');
    await removeStorageItem('username');
    await removeStorageItem('isAdmin');
  };

  return (
    <AuthContext.Provider value={{ token, userId, username, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
