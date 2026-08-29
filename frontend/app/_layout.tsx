import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LogBox, Platform } from 'react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { StatusBar } from 'expo-status-bar';
import { startOfflineSync, syncNow, discardStaleWebQueue } from '../database/api';

LogBox.ignoreLogs(['Unknown event handler property']);
if (Platform.OS === 'web') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unknown event handler property')) return;
    originalConsoleError(...args);
  };
}

function LayoutContent({ theme, isDark }: { theme: any; isDark: boolean }) {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

import { AuthProvider } from '../context/AuthContext';

function LayoutInner() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web never queues new writes (see database/api.ts) -- discard
      // anything queued before that fix shipped, so a stale entry (e.g. a
      // dead image blob: URL) doesn't sit forever misleadingly "previewing"
      // in this tab while silently blocking anything queued behind it.
      discardStaleWebQueue().catch(() => {});
      return;
    }
    // Catches reconnects that happen while the app is open...
    const unsubscribe = startOfflineSync();
    // ...and a queue left over from being closed while offline.
    syncNow().catch(() => {});
    return unsubscribe;
  }, []);

  return (
    <AuthProvider>
      <LayoutContent theme={theme} isDark={isDark} />
    </AuthProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LayoutInner />
    </ThemeProvider>
  );
}
