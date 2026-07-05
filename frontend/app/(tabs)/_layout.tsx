import React from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { LayoutDashboard, Dumbbell, CalendarDays, Library, ClipboardList, Sun, Moon, LogOut, Shield } from 'lucide-react-native';
import { TouchableOpacity, View, Image } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function TabLayout() {
  const { isDark, setMode } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const { signOut, isAdmin } = useAuth();

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerStyle: {
          backgroundColor: theme.background,
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        },
        headerTintColor: theme.text,
        headerLeft: () => (
          <View style={{ marginLeft: 15 }}>
            <Image 
              source={require('../../assets/icon.png')} 
              style={{ width: 32, height: 32, resizeMode: 'contain' }} 
            />
          </View>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15, gap: 16 }}>
            <TouchableOpacity onPress={toggleTheme}>
              {isDark ? <Sun color={theme.tint} size={24} /> : <Moon color={theme.tint} size={24} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut}>
              <LogOut color={theme.tint} size={24} />
            </TouchableOpacity>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color }) => <Dumbbell color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <CalendarDays color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Exercises',
          tabBarIcon: ({ color }) => <Library color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: 'Templates',
          tabBarIcon: ({ color }) => <ClipboardList color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="admin-users"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Shield color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
