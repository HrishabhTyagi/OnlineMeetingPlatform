import axios from 'axios';

export const API_BASE_URL = 'http://localhost:5000/api';
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');
const ACTIVE_ACCOUNT_ID_KEY = 'activeAuthAccountId';
const ACCOUNTS_KEY = 'authAccounts';

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
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    const activeAccount = activeAccountId
      ? accounts.find((account: any) => account.user?.id === activeAccountId)
      : null;

    if (activeAccount?.token) {
      return activeAccount.token;
    }
  } catch {
    // Fall back to the legacy single-account token below.
  }

  return localStorage.getItem('authToken');
}

// Add token to requests
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    config.headers.set('Content-Type', undefined);
  }

  const token = getStoredAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  register: (email: string, firstName: string, lastName: string, password: string) =>
    apiClient.post('/auth/register', { email, firstName, lastName, password }),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
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

  getChatMessages: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/chat`),

  sendChatMessage: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/chat`, data),

  requestLobbyAccess: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/lobby/request`, data),

  getLobbyRequests: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/lobby`),

  decideLobbyRequest: (meetingId: string, requestId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/lobby/${requestId}`, data),

  updateNotes: (meetingId: string, data: any) =>
    apiClient.put(`/meetings/${meetingId}/notes`, data),

  getInvites: (meetingId: string) =>
    apiClient.get(`/meetings/${meetingId}/invites`),

  sendInvites: (meetingId: string, data: any) =>
    apiClient.post(`/meetings/${meetingId}/invites/send`, data),

  uploadRecording: (meetingId: string, data: FormData) =>
    apiClient.post(`/meetings/${meetingId}/recordings`, data),
};

export const conversationAPI = {
  getConversations: () =>
    apiClient.get('/conversations'),

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
