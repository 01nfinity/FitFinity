import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LogBox, Platform } from 'react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { StatusBar } from 'expo-status-bar';
import { startOfflineSync, syncNow } from '../database/api';

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
