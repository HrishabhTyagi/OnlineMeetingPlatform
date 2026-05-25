import axios from 'axios';

export const API_BASE_URL = 'http://localhost:5000/api';
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');
const ACTIVE_ACCOUNT_ID_KEY = 'activeAuthAccountId';
const ACCOUNTS_KEY = 'authAccounts';
const ACTIVE_ORGANIZATION_KEY = 'samvaadActiveOrganization';
const ACTIVE_WORKSPACE_KEY = 'samvaadActiveWorkspace';

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  localAppUrl?: string;
  primaryDomain?: string;
}

export interface ActiveWorkspace {
  kind: 'personal' | 'organization';
  id: string;
  name: string;
  slug?: string;
  organization?: ActiveOrganization;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function resolveApiAssetUrl(url?: string | null) {
  if (!url) {
    return '';
  }

  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

function getStoredAuthToken() {
  try {
    const activeAccountId = sessionStorage.getItem(ACTIVE_ACCOUNT_ID_KEY);
    const accounts = JSON.parse(sessionStorage.getItem(ACCOUNTS_KEY) || localStorage.getItem(ACCOUNTS_KEY) || '[]');
    const activeAccount = activeAccountId
      ? accounts.find((account: any) => account.user?.id === activeAccountId)
      : null;

    if (activeAccount?.token) {
      return activeAccount.token;
    }
  } catch {
    // Fall back to the legacy single-account token below.
  }

  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
}

export function getActiveOrganization(): ActiveOrganization | null {
  try {
    const value = localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
    return value ? JSON.parse(value) as ActiveOrganization : null;
  } catch {
    return null;
  }
}

export function getPersonalWorkspace(): ActiveWorkspace {
  return {
    kind: 'personal',
    id: 'personal',
    name: 'Personal',
    slug: 'personal',
  };
}

export function getActiveWorkspace(): ActiveWorkspace {
  const organization = getActiveOrganization();
  if (organization?.id) {
    return {
      kind: 'organization',
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      organization,
    };
  }

  return getPersonalWorkspace();
}

export function setPersonalWorkspace() {
  localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(getPersonalWorkspace()));
  window.dispatchEvent(new CustomEvent('samvaad-organization-changed'));
  window.dispatchEvent(new CustomEvent('samvaad-workspace-changed', { detail: getPersonalWorkspace() }));
}

export function setActiveOrganization(organization: ActiveOrganization) {
  localStorage.setItem(ACTIVE_ORGANIZATION_KEY, JSON.stringify(organization));
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify({
    kind: 'organization',
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    organization,
  }));
  window.dispatchEvent(new CustomEvent('samvaad-organization-changed', { detail: organization }));
  window.dispatchEvent(new CustomEvent('samvaad-workspace-changed', { detail: getActiveWorkspace() }));
}

export function clearActiveOrganization() {
  setPersonalWorkspace();
}

export function getOrganizationScopedPath(path: string, organization = getActiveOrganization()) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return organization?.slug
    ? `/org/${encodeURIComponent(organization.slug)}${normalizedPath}`
    : `/personal${normalizedPath}`;
}

export function getOrganizationScopedUrl(path: string, organization = getActiveOrganization()) {
  const origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin;
  return `${origin}${getOrganizationScopedPath(path, organization)}`;
}

function normalizeQuery(query = '') {
  return query && !query.startsWith('?') ? `?${query}` : query;
}

function appendQuery(url: string, query = '') {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return url;
  }

  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${normalizedQuery.replace(/^\?/, '')}`;
}

export function getMeetingJoinPath(meetingId: string, query = '') {
  const normalizedQuery = normalizeQuery(query);
  return getOrganizationScopedPath(`/meeting/${meetingId}${normalizedQuery}`);
}

export function getMeetingJoinUrl(meetingId: string, meetingLink?: string | null, query = '') {
  const organization = getActiveOrganization();
  const normalizedQuery = normalizeQuery(query);
  if (meetingLink) {
    return appendQuery(meetingLink, normalizedQuery);
  }

  return getOrganizationScopedUrl(`/meeting/${meetingId}${normalizedQuery}`, organization);
}

export function openUrlInNewTab(url: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const targetUrl = new URL(url, window.location.origin);
  const isSameOrigin = targetUrl.origin === window.location.origin;
  window.open(targetUrl.toString(), '_blank', isSameOrigin ? undefined : 'noopener,noreferrer');
}

export function openMeetingJoinInNewTab(meetingId: string, meetingLink?: string | null, query = '') {
  const joinUrl = getMeetingJoinUrl(meetingId, meetingLink, query);
  openUrlInNewTab(joinUrl);
  return joinUrl;
}

function setHeader(config: any, name: string, value: string) {
  if (typeof config.headers?.set === 'function') {
    config.headers.set(name, value);
    return;
  }

  config.headers = {
    ...(config.headers || {}),
    [name]: value,
  };
}

// Add token to requests
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    config.headers.set('Content-Type', undefined);
  }

  const token = getStoredAuthToken();
  if (token) {
    setHeader(config, 'Authorization', `Bearer ${token}`);
  }

  const organization = getActiveOrganization();
  if (organization?.id) {
    setHeader(config, 'X-Organization-Id', organization.id);
  } else {
    setHeader(config, 'X-Workspace-Type', 'Personal');
  }

  if (organization?.slug) {
    setHeader(config, 'X-Organization-Slug', organization.slug);
  }

  return config;
});

// Auth API
export const authAPI = {
  register: (email: string, firstName: string, lastName: string, password: string) =>
    apiClient.post('/auth/register', { email, firstName, lastName, password }),

  login: (email: string, password: string, rememberDeviceToken?: string | null) =>
    apiClient.post('/auth/login', { email, password, rememberDeviceToken }),

  verifyMfa: (mfaToken: string, code: string, rememberDevice: boolean) =>
    apiClient.post('/auth/mfa/verify', { mfaToken, code, rememberDevice }),
};

// User API
export const userAPI = {
  getProfile: () => apiClient.get('/users/profile'),

  searchUsers: (query?: string) =>
    apiClient.get('/users', { params: query ? { query } : undefined }),

  updateProfile: (data: any) =>
    apiClient.put('/users/profile', data),

  uploadAvatar: (data: FormData) =>
    apiClient.post('/users/profile/avatar', data),

  removeAvatar: () =>
    apiClient.delete('/users/profile/avatar'),

  updateStatus: (status: string) =>
    apiClient.put('/users/status', { status }),

  getUserById: (id: string) =>
    apiClient.get(`/users/${id}`),

  getMfaStatus: () =>
    apiClient.get('/users/mfa/status'),

  setupMfa: () =>
    apiClient.post('/users/mfa/setup'),

  enableMfa: (code: string) =>
    apiClient.post('/users/mfa/enable', { code }),

  disableMfa: (password: string, code?: string) =>
    apiClient.post('/users/mfa/disable', { password, code }),

  regenerateMfaRecoveryCodes: (code: string) =>
    apiClient.post('/users/mfa/recovery-codes/regenerate', { code }),
};

// Meeting API
export const meetingAPI = {
  createMeeting: (data: any) =>
    apiClient.post('/meetings', data),

  getMeeting: (id: string) =>
    apiClient.get(`/meetings/${id}`),

  getMyMeetings: () =>
    apiClient.get('/meetings/organizer/list'),

  getUpcomingMeetings: () =>
    apiClient.get('/meetings/upcoming'),

  updateMeeting: (id: string, data: any) =>
    apiClient.put(`/meetings/${id}`, data),

  deleteMeeting: (id: string) =>
    apiClient.delete(`/meetings/${id}`),

  endMeeting: (id: string) =>
    apiClient.post(`/meetings/${id}/end`),

  joinMeeting: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/participants/join`, data),

  leaveMeeting: (meetingId: string, participantId: string) =>
    apiClient.post(`/meetings/${meetingId}/participants/${participantId}/leave`),

  getParticipants: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/participants`),

  updateParticipantStatus: (meetingId: string, participantId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/participants/${participantId}/status`, data),

  updateParticipantRole: (meetingId: string, participantId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/participants/${participantId}/role`, data),

  updateParticipantHand: (meetingId: string, participantId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/participants/${participantId}/hand`, data),

  updateParticipantReaction: (meetingId: string, participantId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/participants/${participantId}/reaction`, data),

  getChatMessages: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/chat`),

  sendChatMessage: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/chat`, data),

  getCallLogs: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/calls`),

  getRecentCallLogs: (status?: string) =>
    apiClient.get('/meetings/calls/recent', { params: status && status !== 'All' ? { status } : undefined }),

  markCallSeen: (callLogId: string) =>
    apiClient.put(`/meetings/calls/${callLogId}/seen`),

  hideCallLog: (callLogId: string) =>
    apiClient.delete(`/meetings/calls/${callLogId}`),

  clearCallLogs: (status?: string) =>
    apiClient.delete('/meetings/calls', { params: status && status !== 'All' ? { status } : undefined }),

  createCallLog: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/calls`, data),

  updateCallLog: (meetingId: string, callLogId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/calls/${callLogId}`, data),

  requestLobbyAccess: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/lobby/request`, data),

  getLobbyRequests: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/lobby`),

  decideLobbyRequest: (meetingId: string, requestId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/lobby/${requestId}`, data),

  updateNotes: (meetingId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/notes`, data),

  updateWhiteboard: (meetingId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/whiteboard`, data),

  exportChat: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/exports/chat`, { responseType: 'blob' }),

  exportWhiteboard: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/exports/whiteboard`, { responseType: 'blob' }),

  getInvites: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/invites`),

  sendInvites: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/invites/send`, data),

  updateInviteResponse: (meetingId: string, inviteId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/invites/${inviteId}/response`, data),

  uploadRecording: (meetingId: string, data: FormData) =>
    apiClient.post(`/meetings/${meetingId}/recordings`, data),
};

export const organizationAPI = {
  getCurrent: () =>
    apiClient.get('/organizations/current'),

  getMine: () =>
    apiClient.get('/organizations/mine'),

  getBySlug: (slug: string) =>
    apiClient.get(`/organizations/slug/${encodeURIComponent(slug)}`),

  updateCurrent: (data: any) =>
    apiClient.put('/organizations/current', data),

  testStorage: () =>
    apiClient.post('/organizations/current/storage/test'),
};

export const calendarAPI = {
  getProviders: () =>
    apiClient.get('/calendar-connections/providers'),

  getConnections: () =>
    apiClient.get('/calendar-connections'),

  getAuthorizationUrl: (provider: string, redirectUri: string) =>
    apiClient.post(`/calendar-connections/${encodeURIComponent(provider)}/authorize`, { redirectUri }),

  completeConnection: (provider: string, code: string, redirectUri: string) =>
    apiClient.post(`/calendar-connections/${encodeURIComponent(provider)}/callback`, { code, redirectUri }),

  disconnect: (provider: string) =>
    apiClient.delete(`/calendar-connections/${encodeURIComponent(provider)}`),
};

export interface LicensePurchaseRequest {
  planName: string;
  billingCycle: string;
  seatCount: number;
  estimatedAmount: number;
  currency: string;
  companyName: string;
  companySamvaadEmail?: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  notes?: string;
  paymentLast4?: string;
}

export const licenseAPI = {
  requestLicense: (data: LicensePurchaseRequest) =>
    apiClient.post('/license-requests', data),
};

export const teamSpaceAPI = {
  getTeams: () =>
    apiClient.get('/team-spaces'),

  getTeam: (teamId: string) =>
    apiClient.get(`/team-spaces/${teamId}`),

  createTeam: (data: any) =>
    apiClient.post('/team-spaces', data),

  addMembers: (teamId: string, data: any) =>
    apiClient.post(`/team-spaces/${teamId}/members`, data),

  createChannel: (teamId: string, data: any) =>
    apiClient.post(`/team-spaces/${teamId}/channels`, data),

  createTab: (channelId: string, data: any) =>
    apiClient.post(`/team-spaces/channels/${channelId}/tabs`, data),

  deleteTab: (tabId: string) =>
    apiClient.delete(`/team-spaces/tabs/${tabId}`),

  getFiles: (channelId: string) =>
    apiClient.get(`/team-spaces/channels/${channelId}/files`),

  getMeetings: (channelId: string) =>
    apiClient.get(`/team-spaces/channels/${channelId}/meetings`),

  createMeeting: (channelId: string, data: any) =>
    apiClient.post(`/team-spaces/channels/${channelId}/meetings`, data),
};

export const conversationAPI = {
  getConversations: () =>
    apiClient.get('/conversations'),

  search: (query: string) =>
    apiClient.get('/conversations/search', { params: { query } }),

  createConversation: (data: any) =>
    apiClient.post('/conversations', data),

  getMessages: (conversationId: string) =>
    apiClient.get(`/conversations/${conversationId}/messages`),

  markAsRead: (conversationId: string) =>
    apiClient.post(`/conversations/${conversationId}/read`),

  sendMessage: (conversationId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/messages`, data),

  updateMessage: (conversationId: string, messageId: string, data: any) =>
    apiClient.put(`/conversations/${conversationId}/messages/${messageId}`, data),

  deleteMessage: (conversationId: string, messageId: string) =>
    apiClient.delete(`/conversations/${conversationId}/messages/${messageId}`),

  togglePin: (conversationId: string, messageId: string) =>
    apiClient.post(`/conversations/${conversationId}/messages/${messageId}/pin`),

  markMessageUnread: (conversationId: string, messageId: string) =>
    apiClient.post(`/conversations/${conversationId}/messages/${messageId}/unread`),

  toggleReaction: (conversationId: string, messageId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, data),

  getScheduledMessages: (conversationId: string) =>
    apiClient.get(`/conversations/${conversationId}/scheduled-messages`),

  scheduleMessage: (conversationId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/scheduled-messages`, data),

  cancelScheduledMessage: (conversationId: string, scheduledMessageId: string) =>
    apiClient.delete(`/conversations/${conversationId}/scheduled-messages/${scheduledMessageId}`),

  getTasks: (conversationId: string, params?: any) =>
    apiClient.get(`/conversations/${conversationId}/tasks`, { params }),

  createTask: (conversationId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/tasks`, data),

  updateTask: (conversationId: string, taskId: string, data: any) =>
    apiClient.put(`/conversations/${conversationId}/tasks/${taskId}`, data),

  addTaskNote: (conversationId: string, taskId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/tasks/${taskId}/notes`, data),

  deleteTask: (conversationId: string, taskId: string) =>
    apiClient.delete(`/conversations/${conversationId}/tasks/${taskId}`),

  shareDocument: (conversationId: string, messageId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/messages/${messageId}/share-email`, data),

  getDocumentShares: (conversationId: string, messageId?: string) =>
    apiClient.get(`/conversations/${conversationId}/document-shares`, { params: messageId ? { messageId } : undefined }),

  previewAttachmentUrl: (conversationId: string, messageId: string) =>
    `${API_BASE_URL}/conversations/${conversationId}/messages/${messageId}/attachment-preview`,

  previewAttachment: (conversationId: string, messageId: string) =>
    apiClient.get(`/conversations/${conversationId}/messages/${messageId}/attachment-preview`, { responseType: 'blob' }),

  uploadAttachment: (conversationId: string, data: FormData) =>
    apiClient.post(`/conversations/${conversationId}/messages/attachments`, data),

  downloadAttachment: (attachmentUrl: string) =>
    apiClient.get(
      attachmentUrl
        .replace(/^https?:\/\/localhost:5000\/api/i, '')
        .replace(/^\/api/i, ''),
      { responseType: 'blob' },
    ),
};
