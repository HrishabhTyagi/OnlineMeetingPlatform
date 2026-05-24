import { describe, expect, it, vi } from 'vitest';
import type { User } from './authStore';

const asha: User = {
  id: 'user-1',
  email: 'asha@samvaad.test',
  firstName: 'Asha',
  lastName: 'Mehta',
  isEmailVerified: true,
  createdAt: '2026-05-20T00:00:00.000Z',
  status: 'Available',
};

const alex: User = {
  id: 'user-2',
  email: 'alex@samvaad.test',
  firstName: 'Alex',
  lastName: 'Benton',
  isEmailVerified: true,
  createdAt: '2026-05-20T00:00:00.000Z',
  status: 'Busy',
};

async function loadFreshStore() {
  vi.resetModules();
  return import('./authStore');
}

describe('auth store', () => {
  it('logs in multiple accounts and switches active account without losing tokens', async () => {
    const { useAuthStore } = await loadFreshStore();

    useAuthStore.getState().login(asha, 'token-asha');
    useAuthStore.getState().login(alex, 'token-alex');
    useAuthStore.getState().switchAccount('user-1');

    const state = useAuthStore.getState();
    expect(state.user?.email).toBe('asha@samvaad.test');
    expect(state.token).toBe('token-asha');
    expect(state.accounts).toHaveLength(2);
    expect(sessionStorage.getItem('authToken')).toBe('token-asha');
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(sessionStorage.getItem('activeAuthAccountId')).toBe('user-1');
  });

  it('updates active user details while preserving the active token', async () => {
    const { useAuthStore } = await loadFreshStore();

    useAuthStore.getState().login(asha, 'token-asha');
    useAuthStore.getState().setUser({ ...asha, status: 'Busy', profilePictureUrl: '/avatar.png' });

    expect(useAuthStore.getState().user?.status).toBe('Busy');
    expect(useAuthStore.getState().token).toBe('token-asha');
    expect(JSON.parse(sessionStorage.getItem('authUser') || '{}').profilePictureUrl).toBe('/avatar.png');
  });

  it('removes current account and promotes the next saved account', async () => {
    const { useAuthStore } = await loadFreshStore();

    useAuthStore.getState().login(asha, 'token-asha');
    useAuthStore.getState().login(alex, 'token-alex');
    useAuthStore.getState().removeAccount('user-2');

    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(useAuthStore.getState().token).toBe('token-asha');
    expect(useAuthStore.getState().accounts).toHaveLength(1);
  });

  it('logout removes only the active account and keeps another saved account signed in', async () => {
    const { useAuthStore } = await loadFreshStore();

    useAuthStore.getState().login(asha, 'token-asha');
    useAuthStore.getState().login(alex, 'token-alex');
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
