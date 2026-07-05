import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useNativeColorScheme, Platform } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  setMode: () => {},
  isDark: true,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useNativeColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    if (Platform.OS === 'web') {
      const saved = localStorage.getItem('fitfinity_theme');
      if (saved) setMode(saved as ThemeMode);
    }
  }, []);

  const handleSetMode = (newMode: ThemeMode) => {
    setMode(newMode);
    if (Platform.OS === 'web') {
      localStorage.setItem('fitfinity_theme', newMode);
    }
  };

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';

  return (
    <ThemeContext.Provider value={{ mode, setMode: handleSetMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
