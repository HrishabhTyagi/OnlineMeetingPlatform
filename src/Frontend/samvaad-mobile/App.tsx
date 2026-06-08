import 'react-native-gesture-handler';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { WorkspaceProvider } from './src/context/WorkspaceContext';
import { ThemeProvider, useThemePreference } from './src/context/ThemeContext';
import RootNavigator from './src/screens/RootNavigator';
import NotificationBridge from './src/components/NotificationBridge';
import { navigationRef } from './src/services/navigation';

const queryClient = new QueryClient();

function AppShell() {
  const { isDark } = useThemePreference();
  const { ready } = useAuth();

  if (!ready) {
    return null;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={isDark ? DarkTheme : DefaultTheme}
      linking={{
        prefixes: ['samvaad://', 'http://localhost:8091', 'https://samvaad.local'],
        config: {
          screens: {
            Main: '',
            MeetingRoom: 'meeting/:meetingId',
            Tasks: 'tasks',
            Files: 'files',
            Recordings: 'recordings',
            Profile: 'profile',
            OrganizationSettings: 'organization',
            License: 'license',
          },
        },
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
      <NotificationBridge />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <WorkspaceProvider>
                <AppShell />
              </WorkspaceProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
