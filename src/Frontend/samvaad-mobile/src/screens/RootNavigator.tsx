import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import CallsScreen from './CallsScreen';
import ChatScreen from './ChatScreen';
import DashboardScreen from './DashboardScreen';
import FilesScreen from './FilesScreen';
import LicenseScreen from './LicenseScreen';
import LoginScreen from './LoginScreen';
import MeetingRoomScreen from './MeetingRoomScreen';
import ProfileScreen from './ProfileScreen';
import RecordingsScreen from './RecordingsScreen';
import RegisterScreen from './RegisterScreen';
import TasksScreen from './TasksScreen';
import TeamsScreen from './TeamsScreen';
import OrganizationSettingsScreen from './OrganizationSettingsScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: undefined;
  MeetingRoom: { meetingId: string };
  License: undefined;
  Tasks: undefined;
  Files: undefined;
  Recordings: undefined;
  Profile: undefined;
  OrganizationSettings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarLabelPosition: 'below-icon' }}>
      <Tabs.Screen name="Today" component={DashboardScreen} options={{ tabBarIcon: () => null }} />
      <Tabs.Screen name="Chat" component={ChatScreen} options={{ tabBarIcon: () => null }} />
      <Tabs.Screen name="Meet" component={MeetingRoomScreen as any} options={{ tabBarIcon: () => null }} initialParams={{ meetingId: '' }} />
      <Tabs.Screen name="Calls" component={CallsScreen} options={{ tabBarIcon: () => null }} />
      <Tabs.Screen name="Teams" component={TeamsScreen} options={{ tabBarIcon: () => null }} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="MeetingRoom" component={MeetingRoomScreen} />
          <Stack.Screen name="License" component={LicenseScreen} />
          <Stack.Screen name="Tasks" component={TasksScreen} />
          <Stack.Screen name="Files" component={FilesScreen} />
          <Stack.Screen name="Recordings" component={RecordingsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="OrganizationSettings" component={OrganizationSettingsScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
