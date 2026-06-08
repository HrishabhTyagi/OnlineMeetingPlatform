import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationAPI } from './api';
import { storage } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  const finalStatus = current.granted ? current : await Notifications.requestPermissionsAsync();
  return finalStatus.granted;
}

export async function registerPushDevice() {
  if (Platform.OS === 'web') {
    return null;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenResponse.data;
    if (!pushToken) {
      return null;
    }

    await notificationAPI.registerDevice({
      pushToken,
      platform: Platform.OS,
      deviceName: `${Platform.OS} device`,
    });
    await storage.setPushToken(pushToken);
    return pushToken;
  } catch {
    return null;
  }
}

export async function unregisterPushDevice() {
  if (Platform.OS === 'web') {
    return;
  }

  const pushToken = await storage.getPushToken();
  if (!pushToken) {
    return;
  }

  try {
    await notificationAPI.unregisterDeviceToken(pushToken);
  } finally {
    await storage.setPushToken(null);
  }
}

export async function showLocalNotification(title: string, body: string, data?: Record<string, unknown>) {
  if (Platform.OS === 'web') {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}
