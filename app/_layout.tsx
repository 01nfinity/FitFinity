import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { migrateDbIfNeeded } from '../database/db';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LogBox, Platform, TouchableOpacity } from 'react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { StatusBar } from 'expo-status-bar';
import { Moon, Sun } from 'lucide-react-native';

LogBox.ignoreLogs(['Unknown event handler property']);
if (Platform.OS === 'web') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unknown event handler property')) return;
    originalConsoleError(...args);
  };
}

function LayoutInner() {
  const { isDark, mode, setMode } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SQLiteProvider databaseName="fitfinity.db" onInit={migrateDbIfNeeded}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.tint,
            contentStyle: { backgroundColor: theme.background },
            headerRight: () => (
              <TouchableOpacity onPress={toggleTheme} style={{ marginRight: 15 }}>
                {isDark ? <Sun color={theme.tint} size={24} /> : <Moon color={theme.tint} size={24} />}
              </TouchableOpacity>
            ),
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LayoutInner />
    </ThemeProvider>
  );
}
