import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    config.headers.set('Content-Type', undefined);
  }

  const token = localStorage.getItem('authToken');
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

  sendMessage: (conversationId: string, data: any) =>
    apiClient.post(`/conversations/${conversationId}/messages`, data),
};
