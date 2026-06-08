import axios from 'axios';
import { Linking, Platform } from 'react-native';
import { AuthSession, Organization, Workspace } from '../types/api';

const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${host}:5000/api`;
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

let activeSession: AuthSession | null = null;
let activeWorkspace: Workspace = { kind: 'personal', id: 'personal', name: 'Personal', slug: 'personal' };

export function setApiSession(session: AuthSession | null) {
  activeSession = session;
}

export function setApiWorkspace(workspace: Workspace) {
  activeWorkspace = workspace;
}

export function resolveApiAssetUrl(url?: string | null) {
  if (!url) {
    return '';
  }

  if (/^(https?:|data:|blob:|file:)/i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function openProtectedApiAsset(url?: string | null) {
  const assetUrl = resolveApiAssetUrl(url);
  if (!assetUrl) {
    return;
  }

  await Linking.openURL(assetUrl);
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  if (activeSession?.token) {
    config.headers.Authorization = `Bearer ${activeSession.token}`;
  }

  if (activeWorkspace.kind === 'organization' && activeWorkspace.organization?.id) {
    config.headers['X-Organization-Id'] = activeWorkspace.organization.id;
    config.headers['X-Organization-Slug'] = activeWorkspace.organization.slug;
  } else {
    config.headers['X-Workspace-Type'] = 'Personal';
  }

  return config;
});

export const authAPI = {
  register: (email: string, firstName: string, lastName: string, password: string) =>
    apiClient.post('/auth/register', { email, firstName, lastName, password }),
  login: (email: string, password: string, rememberDeviceToken?: string | null) =>
    apiClient.post('/auth/login', { email, password, rememberDeviceToken }),
  verifyMfa: (mfaToken: string, code: string, rememberDevice: boolean) =>
    apiClient.post('/auth/mfa/verify', { mfaToken, code, rememberDevice }),
};

export const userAPI = {
  getProfile: () => apiClient.get('/users/profile'),
  searchUsers: (query?: string) => apiClient.get('/users', { params: query ? { query } : undefined }),
  updateProfile: (data: any) => apiClient.put('/users/profile', data),
  updateStatus: (status: string) => apiClient.put('/users/status', { status }),
  uploadAvatar: (data: FormData) => apiClient.post('/users/profile/avatar', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMfaStatus: () => apiClient.get('/users/mfa/status'),
  setupMfa: () => apiClient.post('/users/mfa/setup'),
  enableMfa: (code: string) => apiClient.post('/users/mfa/enable', { code }),
  disableMfa: (password: string, code?: string) => apiClient.post('/users/mfa/disable', { password, code }),
  regenerateMfaRecoveryCodes: (code: string) => apiClient.post('/users/mfa/recovery-codes/regenerate', { code }),
  removeAvatar: () => apiClient.delete('/users/profile/avatar'),
};

export const organizationAPI = {
  getMine: () => apiClient.get('/organizations/mine'),
  getCurrent: () => apiClient.get('/organizations/current'),
  getBySlug: (slug: string) => apiClient.get(`/organizations/slug/${encodeURIComponent(slug)}`),
  updateCurrent: (data: any) => apiClient.put('/organizations/current', data),
  testStorage: () => apiClient.post('/organizations/current/storage/test'),
  setActive: (organization: Organization) => setApiWorkspace({ kind: 'organization', id: organization.id, name: organization.name, slug: organization.slug, organization }),
};

export const meetingAPI = {
  createMeeting: (data: any) => apiClient.post('/meetings', data),
  getMeeting: (id: string) => apiClient.get(`/meetings/${id}`),
  getUpcomingMeetings: () => apiClient.get('/meetings/upcoming'),
  getMyMeetings: () => apiClient.get('/meetings/organizer/list'),
  updateMeeting: (id: string, data: any) => apiClient.put(`/meetings/${id}`, data),
  deleteMeeting: (id: string) => apiClient.delete(`/meetings/${id}`),
  endMeeting: (id: string) => apiClient.post(`/meetings/${id}/end`),
  joinMeeting: (meetingId: string, data: any) => apiClient.post(`/meetings/${meetingId}/participants/join`, data),
  leaveMeeting: (meetingId: string, participantId: string) => apiClient.post(`/meetings/${meetingId}/participants/${participantId}/leave`),
  getParticipants: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/participants`),
  updateParticipantStatus: (meetingId: string, participantId: string, data: any) => apiClient.put(`/meetings/${meetingId}/participants/${participantId}/status`, data),
  updateParticipantHand: (meetingId: string, participantId: string, data: any) => apiClient.put(`/meetings/${meetingId}/participants/${participantId}/hand`, data),
  updateParticipantReaction: (meetingId: string, participantId: string, data: any) => apiClient.put(`/meetings/${meetingId}/participants/${participantId}/reaction`, data),
  updateParticipantRole: (meetingId: string, participantId: string, data: any) => apiClient.put(`/meetings/${meetingId}/participants/${participantId}/role`, data),
  getChatMessages: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/chat`),
  sendChatMessage: (meetingId: string, data: any) => apiClient.post(`/meetings/${meetingId}/chat`, data),
  uploadChatAttachment: (meetingId: string, data: FormData) => apiClient.post(`/meetings/${meetingId}/chat/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getCallLogs: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/calls`),
  getRecentCallLogs: (status?: string) => apiClient.get('/meetings/calls/recent', { params: status && status !== 'All' ? { status } : undefined }),
  createCallLog: (meetingId: string, data: any) => apiClient.post(`/meetings/${meetingId}/calls`, data),
  updateCallLog: (meetingId: string, callLogId: string, data: any) => apiClient.put(`/meetings/${meetingId}/calls/${callLogId}`, data),
  sendInvites: (meetingId: string, data: any) => apiClient.post(`/meetings/${meetingId}/invites/send`, data),
  getInvites: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/invites`),
  updateInviteResponse: (meetingId: string, inviteId: string, data: any) => apiClient.put(`/meetings/${meetingId}/invites/${inviteId}/response`, data),
  updateWhiteboard: (meetingId: string, data: any) => apiClient.put(`/meetings/${meetingId}/whiteboard`, data),
  updateNotes: (meetingId: string, data: any) => apiClient.put(`/meetings/${meetingId}/notes`, data),
  exportChat: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/exports/chat`, { responseType: 'blob' }),
  exportWhiteboard: (meetingId: string) => apiClient.get(`/meetings/${meetingId}/exports/whiteboard`, { responseType: 'blob' }),
  uploadRecording: (meetingId: string, data: FormData) => apiClient.post(`/meetings/${meetingId}/recordings`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const conversationAPI = {
  getConversations: () => apiClient.get('/conversations'),
  search: (query: string) => apiClient.get('/conversations/search', { params: { query } }),
  createConversation: (data: any) => apiClient.post('/conversations', data),
  getMessages: (conversationId: string) => apiClient.get(`/conversations/${conversationId}/messages`),
  markAsRead: (conversationId: string) => apiClient.post(`/conversations/${conversationId}/read`),
  sendMessage: (conversationId: string, data: any) => apiClient.post(`/conversations/${conversationId}/messages`, data),
  updateMessage: (conversationId: string, messageId: string, data: any) => apiClient.put(`/conversations/${conversationId}/messages/${messageId}`, data),
  deleteMessage: (conversationId: string, messageId: string) => apiClient.delete(`/conversations/${conversationId}/messages/${messageId}`),
  togglePin: (conversationId: string, messageId: string) => apiClient.post(`/conversations/${conversationId}/messages/${messageId}/pin`),
  markMessageUnread: (conversationId: string, messageId: string) => apiClient.post(`/conversations/${conversationId}/messages/${messageId}/unread`),
  toggleReaction: (conversationId: string, messageId: string, data: any) => apiClient.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, data),
  scheduleMessage: (conversationId: string, data: any) => apiClient.post(`/conversations/${conversationId}/scheduled-messages`, data),
  getScheduledMessages: (conversationId: string) => apiClient.get(`/conversations/${conversationId}/scheduled-messages`),
  getTasks: (conversationId: string, params?: any) => apiClient.get(`/conversations/${conversationId}/tasks`, { params }),
  createTask: (conversationId: string, data: any) => apiClient.post(`/conversations/${conversationId}/tasks`, data),
  updateTask: (conversationId: string, taskId: string, data: any) => apiClient.put(`/conversations/${conversationId}/tasks/${taskId}`, data),
  addTaskNote: (conversationId: string, taskId: string, data: any) => apiClient.post(`/conversations/${conversationId}/tasks/${taskId}/notes`, data),
  deleteTask: (conversationId: string, taskId: string) => apiClient.delete(`/conversations/${conversationId}/tasks/${taskId}`),
  uploadAttachment: (conversationId: string, data: FormData) => apiClient.post(`/conversations/${conversationId}/messages/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  shareDocument: (conversationId: string, messageId: string, data: any) => apiClient.post(`/conversations/${conversationId}/messages/${messageId}/share-email`, data),
  getDocumentShares: (conversationId: string, messageId?: string) => apiClient.get(`/conversations/${conversationId}/document-shares`, { params: messageId ? { messageId } : undefined }),
  previewAttachment: (conversationId: string, messageId: string) => apiClient.get(`/conversations/${conversationId}/messages/${messageId}/attachment-preview`, { responseType: 'blob' }),
  cancelScheduledMessage: (conversationId: string, scheduledMessageId: string) => apiClient.delete(`/conversations/${conversationId}/scheduled-messages/${scheduledMessageId}`),
};

export const teamSpaceAPI = {
  getTeams: () => apiClient.get('/team-spaces'),
  getTeam: (teamId: string) => apiClient.get(`/team-spaces/${teamId}`),
  createTeam: (data: any) => apiClient.post('/team-spaces', data),
  addMembers: (teamId: string, data: any) => apiClient.post(`/team-spaces/${teamId}/members`, data),
  createChannel: (teamId: string, data: any) => apiClient.post(`/team-spaces/${teamId}/channels`, data),
};

export const calendarAPI = {
  getProviders: () => apiClient.get('/calendar-connections/providers'),
  getConnections: () => apiClient.get('/calendar-connections'),
  getAuthorizationUrl: (provider: string, redirectUri: string) => apiClient.post(`/calendar-connections/${encodeURIComponent(provider)}/authorize`, { redirectUri }),
  completeConnection: (provider: string, code: string, redirectUri: string) => apiClient.post(`/calendar-connections/${encodeURIComponent(provider)}/callback`, { code, redirectUri }),
  disconnect: (provider: string) => apiClient.delete(`/calendar-connections/${encodeURIComponent(provider)}`),
};

export const notificationAPI = {
  registerDevice: (data: { pushToken: string; platform: string; deviceName?: string }) =>
    apiClient.post('/notifications/devices', data),
  unregisterDeviceToken: (pushToken: string) =>
    apiClient.delete('/notifications/devices/token', { params: { pushToken } }),
  getDevices: () => apiClient.get('/notifications/devices'),
};

export const licenseAPI = {
  requestLicense: (data: any) => apiClient.post('/license-requests', data),
};
