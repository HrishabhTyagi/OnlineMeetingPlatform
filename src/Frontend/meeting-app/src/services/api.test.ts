import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  apiClient,
  authAPI,
  clearActiveOrganization,
  getMeetingJoinPath,
  getMeetingJoinUrl,
  getOrganizationScopedPath,
  getOrganizationScopedUrl,
  resolveApiAssetUrl,
  setActiveOrganization,
  userAPI,
} from './api';

describe('api helpers', () => {
  beforeEach(() => {
    clearActiveOrganization();
  });

  it('scopes paths and urls to the active organization slug', () => {
    setActiveOrganization({ id: 'org-1', name: 'Acme', slug: 'acme' });

    expect(getOrganizationScopedPath('/chat')).toBe('/org/acme/chat');
    expect(getOrganizationScopedPath('calls')).toBe('/org/acme/calls');
    expect(getMeetingJoinPath('meeting-1', 'call=video')).toBe('/org/acme/meeting/meeting-1?call=video');
    expect(getOrganizationScopedUrl('/dashboard')).toBe('http://localhost:3000/org/acme/dashboard');
  });

  it('falls back to personal workspace paths when no organization is active', () => {
    expect(getOrganizationScopedPath('/chat')).toBe('/personal/chat');
    expect(getMeetingJoinUrl('meeting-1')).toBe('http://localhost:3000/personal/meeting/meeting-1');
  });

  it('appends query strings to existing meeting links', () => {
    expect(getMeetingJoinUrl('ignored', 'http://localhost:5173/org/acme/meeting/abc?from=email', 'autojoin=1'))
      .toBe('http://localhost:5173/org/acme/meeting/abc?from=email&autojoin=1');
  });

  it('resolves API asset urls without changing absolute data or blob urls', () => {
    expect(resolveApiAssetUrl('/recordings/demo.webm')).toBe('http://localhost:5000/recordings/demo.webm');
    expect(resolveApiAssetUrl('https://cdn.example.com/file.pdf')).toBe('https://cdn.example.com/file.pdf');
    expect(resolveApiAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(resolveApiAssetUrl('')).toBe('');
  });

  it('emits an organization change event when active organization changes', () => {
    const listener = vi.fn();
    window.addEventListener('samvaad-organization-changed', listener);

    setActiveOrganization({ id: 'org-1', name: 'Acme', slug: 'acme' });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('samvaad-organization-changed', listener);
  });

  it('sends MFA auth and account security requests to the expected endpoints', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} } as any);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: {} } as any);

    await authAPI.login('asha@samvaad.test', 'Password123!', 'remember-token');
    await authAPI.verifyMfa('mfa-token', '123456', true);
    await userAPI.getMfaStatus();
    await userAPI.setupMfa();
    await userAPI.enableMfa('123456');
    await userAPI.disableMfa('Password123!', '123456');
    await userAPI.regenerateMfaRecoveryCodes('123456');

    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'asha@samvaad.test',
      password: 'Password123!',
      rememberDeviceToken: 'remember-token',
    });
    expect(post).toHaveBeenCalledWith('/auth/mfa/verify', {
      mfaToken: 'mfa-token',
      code: '123456',
      rememberDevice: true,
    });
    expect(get).toHaveBeenCalledWith('/users/mfa/status');
    expect(post).toHaveBeenCalledWith('/users/mfa/setup');
    expect(post).toHaveBeenCalledWith('/users/mfa/enable', { code: '123456' });
    expect(post).toHaveBeenCalledWith('/users/mfa/disable', { password: 'Password123!', code: '123456' });
    expect(post).toHaveBeenCalledWith('/users/mfa/recovery-codes/regenerate', { code: '123456' });

    post.mockRestore();
    get.mockRestore();
  });
});
