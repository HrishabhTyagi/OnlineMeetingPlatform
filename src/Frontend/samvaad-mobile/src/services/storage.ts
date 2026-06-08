import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthSession, Organization, Workspace } from '../types/api';

const SESSION_KEY = 'samvaad.mobile.session';
const WORKSPACE_KEY = 'samvaad.mobile.workspace';
const THEME_KEY = 'samvaad.mobile.theme';
const PUSH_TOKEN_KEY = 'samvaad.mobile.pushToken';

export const storage = {
  async getSession() {
    const value = await AsyncStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as AuthSession : null;
  },
  async setSession(session: AuthSession | null) {
    if (!session) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return;
    }

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  async getWorkspace() {
    const value = await AsyncStorage.getItem(WORKSPACE_KEY);
    return value ? JSON.parse(value) as Workspace : null;
  },
  async setWorkspace(workspace: Workspace) {
    await AsyncStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  },
  async setOrganization(organization: Organization) {
    await storage.setWorkspace({
      kind: 'organization',
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      organization,
    });
  },
  async getThemeName() {
    return AsyncStorage.getItem(THEME_KEY);
  },
  async setThemeName(themeName: string) {
    await AsyncStorage.setItem(THEME_KEY, themeName);
  },
  async getPushToken() {
    return AsyncStorage.getItem(PUSH_TOKEN_KEY);
  },
  async setPushToken(pushToken: string | null) {
    if (!pushToken) {
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
      return;
    }

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken);
  },
};
