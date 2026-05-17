import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';

type StorageProvider = 'ApplicationLocal' | 'CustomerPremises' | 'CloudMounted';

interface OrganizationSettingsForm {
  name: string;
  slug: string;
  primaryDomain: string;
  storageProvider: StorageProvider;
  storageRootPath: string;
  publicBaseUrl: string;
  recordingRetentionDays: number;
  attachmentRetentionDays: number;
  maxRecordingMegabytes: number;
  maxAttachmentMegabytes: number;
  enableRecordingByDefault: boolean;
  requireLobbyByDefault: boolean;
  allowExternalGuests: boolean;
}

interface OrganizationRecord extends OrganizationSettingsForm {
  id: string;
  localAppUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  displayName: string;
  role: OrganizationMemberRole;
  joinedAt?: string;
  updatedAt?: string;
}

interface OrganizationUsage {
  organizationId: string;
  organizationName: string;
  storageProvider: StorageProvider;
  memberCount: number;
  roleCounts: Array<{ role: OrganizationMemberRole; count: number }>;
  estimatedActiveStorageGb: number;
  maxRecordingMegabytes: number;
  maxAttachmentMegabytes: number;
  recordingRetentionDays: number;
  attachmentRetentionDays: number;
  auditEventsLast30Days: number;
  lastActivityAt?: string;
}

interface OrganizationMeetingUsage {
  organizationId: string;
  totalMeetings: number;
  upcomingMeetings: number;
  activeMeetings: number;
  recordedMeetings: number;
  meetingInvites: number;
  participantJoins: number;
  conversations: number;
  chatMessages: number;
  attachments: number;
  attachmentBytes: number;
  lastMeetingAt?: string;
  lastMessageAt?: string;
}

interface OrganizationAuditEvent {
  id: string;
  organizationId: string;
  organizationName: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  profilePictureUrl?: string;
  status?: string;
}

type OrganizationMemberRole = 'Owner' | 'Admin' | 'Member' | 'Guest';

interface AdminUser {
  userId?: string;
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const providerOptions: Array<{ value: StorageProvider; title: string; description: string }> = [
  {
    value: 'ApplicationLocal',
    title: 'Application local',
    description: 'Use the app server disk for a simple low-cost setup.',
  },
  {
    value: 'CustomerPremises',
    title: 'Customer premises',
    description: 'Use a customer-owned local path or network share.',
  },
  {
    value: 'CloudMounted',
    title: 'Cloud mounted',
    description: 'Use a mounted bucket, blobfuse, rclone mount, or cloud volume.',
  },
];

const memberRoleOptions: OrganizationMemberRole[] = ['Owner', 'Admin', 'Member', 'Guest'];

const defaultForm: OrganizationSettingsForm = {
  name: 'Samvaad Organization',
  slug: '',
  primaryDomain: '',
  storageProvider: 'ApplicationLocal',
  storageRootPath: '',
  publicBaseUrl: '',
  recordingRetentionDays: 30,
  attachmentRetentionDays: 30,
  maxRecordingMegabytes: 750,
  maxAttachmentMegabytes: 50,
  enableRecordingByDefault: false,
  requireLobbyByDefault: true,
  allowExternalGuests: true,
};

function normalizeSettings(data: Partial<OrganizationSettingsForm> | null | undefined): OrganizationSettingsForm {
  return {
    name: data?.name || defaultForm.name,
    slug: (data as any)?.slug || '',
    primaryDomain: data?.primaryDomain || '',
    storageProvider: data?.storageProvider || 'ApplicationLocal',
    storageRootPath: data?.storageRootPath || '',
    publicBaseUrl: data?.publicBaseUrl || '',
    recordingRetentionDays: data?.recordingRetentionDays ?? defaultForm.recordingRetentionDays,
    attachmentRetentionDays: data?.attachmentRetentionDays ?? defaultForm.attachmentRetentionDays,
    maxRecordingMegabytes: data?.maxRecordingMegabytes ?? defaultForm.maxRecordingMegabytes,
    maxAttachmentMegabytes: data?.maxAttachmentMegabytes ?? defaultForm.maxAttachmentMegabytes,
    enableRecordingByDefault: Boolean(data?.enableRecordingByDefault),
    requireLobbyByDefault: data?.requireLobbyByDefault ?? true,
    allowExternalGuests: data?.allowExternalGuests ?? true,
  };
}

function normalizeOrganization(data: any): OrganizationRecord {
  return {
    id: data.id,
    localAppUrl: data.localAppUrl || buildLocalAppUrl(data.slug, data.name),
    ...normalizeSettings(data),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function normalizeMember(data: any): OrganizationMember {
  return {
    id: data.id,
    organizationId: data.organizationId,
    userId: data.userId,
    email: data.email,
    displayName: data.displayName || data.email,
    role: data.role || 'Member',
    joinedAt: data.joinedAt,
    updatedAt: data.updatedAt,
  };
}

function normalizeUsage(data: any): OrganizationUsage {
  return {
    organizationId: data.organizationId,
    organizationName: data.organizationName,
    storageProvider: data.storageProvider || 'ApplicationLocal',
    memberCount: data.memberCount || 0,
    roleCounts: data.roleCounts || [],
    estimatedActiveStorageGb: data.estimatedActiveStorageGb || 0,
    maxRecordingMegabytes: data.maxRecordingMegabytes || 0,
    maxAttachmentMegabytes: data.maxAttachmentMegabytes || 0,
    recordingRetentionDays: data.recordingRetentionDays || 0,
    attachmentRetentionDays: data.attachmentRetentionDays || 0,
    auditEventsLast30Days: data.auditEventsLast30Days || 0,
    lastActivityAt: data.lastActivityAt,
  };
}

function normalizeMeetingUsage(data: any): OrganizationMeetingUsage {
  return {
    organizationId: data.organizationId,
    totalMeetings: data.totalMeetings || 0,
    upcomingMeetings: data.upcomingMeetings || 0,
    activeMeetings: data.activeMeetings || 0,
    recordedMeetings: data.recordedMeetings || 0,
    meetingInvites: data.meetingInvites || 0,
    participantJoins: data.participantJoins || 0,
    conversations: data.conversations || 0,
    chatMessages: data.chatMessages || 0,
    attachments: data.attachments || 0,
    attachmentBytes: data.attachmentBytes || 0,
    lastMeetingAt: data.lastMeetingAt,
    lastMessageAt: data.lastMessageAt,
  };
}

function normalizeAuditEvent(data: any): OrganizationAuditEvent {
  return {
    id: data.id,
    organizationId: data.organizationId,
    organizationName: data.organizationName,
    actorUserId: data.actorUserId,
    actorEmail: data.actorEmail,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    summary: data.summary,
    createdAt: data.createdAt,
  };
}

function estimateMonthlyStorage(form: OrganizationSettingsForm) {
  const recordingBudgetGb = Math.max(1, Math.round((form.maxRecordingMegabytes * 20) / 1024));
  const attachmentBudgetGb = Math.max(1, Math.round((form.maxAttachmentMegabytes * 500) / 1024));
  const retentionMultiplier = Math.max(form.recordingRetentionDays, form.attachmentRetentionDays) / 30;
  return Math.max(1, Math.round((recordingBudgetGb + attachmentBudgetGb) * retentionMultiplier));
}

function formatDate(value?: string) {
  if (!value) {
    return 'Not saved yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) {
    return 'No activity yet';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SO';
}

function getUserDisplayName(user: UserSearchResult) {
  return user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function getApiErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.title) {
    return data.title;
  }

  if (err?.response?.status === 502 || err?.response?.status === 503 || err?.response?.status === 504) {
    return 'Organization Service is not running. Start it on http://localhost:5004 or rerun run-all-services.ps1.';
  }

  if (err?.response?.status === 401) {
    return 'Your admin session expired. Sign out and sign in again.';
  }

  if (err?.code === 'ERR_NETWORK') {
    return 'Cannot reach the API gateway. Make sure API Gateway is running on http://localhost:5000.';
  }

  return fallback;
}

function slugifyUrlName(value?: string) {
  const raw = (value || '').trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || '';
}

function buildLocalAppUrl(slug?: string, organizationName?: string) {
  const urlName = slugifyUrlName(slug || organizationName);
  return urlName ? `http://localhost:5173/org/${encodeURIComponent(urlName)}` : '';
}

function HandshakeMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-indigo-600 text-white shadow-sm">
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden="true">
        <path d="m8.2 12.3 2.2-2.2a2.2 2.2 0 0 1 3.1 0l.7.7 1.5-1.5a2.1 2.1 0 0 1 3 0l1.2 1.2-4.7 4.7a3.8 3.8 0 0 1-5.4 0l-1.6-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m3.8 10.6 2.6-2.5a3.2 3.2 0 0 1 4.4-.1l.3.2-4.5 4.5a1.4 1.4 0 0 0 2 2l2.1-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m4 10.5 4.7 4.7M20 10.5l-4.8 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '');
  const [activeUser, setActiveUser] = useState<AdminUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('authUser') || 'null') as AdminUser | null;
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [organizationUsage, setOrganizationUsage] = useState<OrganizationUsage | null>(null);
  const [meetingUsage, setMeetingUsage] = useState<OrganizationMeetingUsage | null>(null);
  const [auditEvents, setAuditEvents] = useState<OrganizationAuditEvent[]>([]);
  const [createForm, setCreateForm] = useState({ name: '', slug: '', primaryDomain: '' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<OrganizationMemberRole>('Member');
  const [form, setForm] = useState<OrganizationSettingsForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId],
  );
  const selectedOrganizationUrl = buildLocalAppUrl(form.slug || selectedOrganization?.slug, form.name || selectedOrganization?.name)
    || selectedOrganization?.localAppUrl
    || '';
  const createOrganizationUrl = buildLocalAppUrl(createForm.slug, createForm.name);
  const estimatedStorageGb = useMemo(() => estimateMonthlyStorage(form), [form]);
  const selectedProvider = providerOptions.find((provider) => provider.value === form.storageProvider) || providerOptions[0];
  const dashboardUsage = organizationUsage || {
    estimatedActiveStorageGb: estimatedStorageGb,
    memberCount: members.length,
    auditEventsLast30Days: 0,
    roleCounts: [],
  };
  const roleSummary = (organizationUsage?.roleCounts || [])
    .map((item) => `${item.role}: ${item.count}`)
    .join(' | ');

  const persistSession = (data: any) => {
    const user = {
      id: data.userId,
      userId: data.userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    };

    localStorage.setItem('authToken', data.token);
    localStorage.setItem('authUser', JSON.stringify(user));
    setToken(data.token);
    setActiveUser(user);
  };

  const loadMembers = async (organizationId: string) => {
    setLoadingMembers(true);

    try {
      const response = await api.get(`/organizations/${organizationId}/members`);
      setMembers(response.data.map(normalizeMember));
    } catch (err: any) {
      setMembers([]);
      setError(getApiErrorMessage(err, 'Unable to load organization users.'));
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadOrganizationInsights = async (organizationId: string) => {
    setLoadingInsights(true);

    try {
      const [usageResponse, meetingUsageResponse, auditResponse] = await Promise.allSettled([
        api.get(`/organizations/${organizationId}/usage`),
        api.get(`/meetings/organizations/${organizationId}/usage`),
        api.get(`/organizations/${organizationId}/audit`, { params: { take: 25 } }),
      ]);

      if (usageResponse.status === 'fulfilled') {
        setOrganizationUsage(normalizeUsage(usageResponse.value.data));
      } else {
        setOrganizationUsage(null);
      }

      if (meetingUsageResponse.status === 'fulfilled') {
        setMeetingUsage(normalizeMeetingUsage(meetingUsageResponse.value.data));
      } else {
        setMeetingUsage(null);
      }

      if (auditResponse.status === 'fulfilled') {
        setAuditEvents(auditResponse.value.data.map(normalizeAuditEvent));
      } else {
        setAuditEvents([]);
      }
    } catch (err: any) {
      setOrganizationUsage(null);
      setMeetingUsage(null);
      setAuditEvents([]);
      setError(getApiErrorMessage(err, 'Unable to load organization insights.'));
    } finally {
      setLoadingInsights(false);
    }
  };

  const selectOrganization = (organization: OrganizationRecord) => {
    setSelectedOrganizationId(organization.id);
    setForm(normalizeSettings(organization));
    loadMembers(organization.id);
    loadOrganizationInsights(organization.id);
    setStatus('');
    setError('');
  };

  const loadOrganizations = async (preferredId?: string) => {
    setLoading(true);

    try {
      const response = await api.get('/organizations');
      const normalized = response.data.map(normalizeOrganization);
      setOrganizations(normalized);

      const selected = normalized.find((organization: OrganizationRecord) => organization.id === preferredId)
        || normalized.find((organization: OrganizationRecord) => organization.id === selectedOrganizationId)
        || normalized[0];

      if (selected) {
        selectOrganization(selected);
      }

      setError('');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to load organizations.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    loadOrganizations();
  }, [token]);

  useEffect(() => {
    if (!token || userQuery.trim().length < 2) {
      setUserResults([]);
      setSelectedUserId('');
      return;
    }

    const handle = window.setTimeout(() => {
      setSearchingUsers(true);
      api.get('/users', { params: { query: userQuery.trim() } })
        .then((response) => {
          const memberUserIds = new Set(members.map((member) => member.userId));
          const users = response.data.filter((user: UserSearchResult) => !memberUserIds.has(user.id));
          setUserResults(users);
          setSelectedUserId((current) => (users.some((user: UserSearchResult) => user.id === current) ? current : ''));
        })
        .catch((err) => setError(getApiErrorMessage(err, 'Unable to search Samvaad users.')))
        .finally(() => setSearchingUsers(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [token, userQuery, members]);

  const updateForm = (updates: Partial<OrganizationSettingsForm>) => {
    setForm((current) => ({ ...current, ...updates }));
    setStatus('');
    setError('');
  };

  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setStatus('');
    setError('');

    try {
      const response = await api.post('/organizations', createForm);
      const created = normalizeOrganization(response.data);
      setOrganizations((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      selectOrganization(created);
      setCreateForm({ name: '', slug: '', primaryDomain: '' });
      setShowCreateForm(false);
      setStatus('Organization created.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to create organization.'));
    } finally {
      setCreating(false);
    }
  };

  const addMember = async () => {
    const user = userResults.find((item) => item.id === selectedUserId);
    if (!selectedOrganizationId || !user) {
      setError('Select a Samvaad user to add.');
      return;
    }

    setAddingMember(true);
    setStatus('');
    setError('');

    try {
      const response = await api.post(`/organizations/${selectedOrganizationId}/members`, {
        userId: user.id,
        email: user.email,
        displayName: getUserDisplayName(user),
        role: newMemberRole,
      });
      setMembers((current) => [...current, normalizeMember(response.data)].sort((left, right) => left.displayName.localeCompare(right.displayName)));
      setSelectedUserId('');
      setUserQuery('');
      setUserResults([]);
      setNewMemberRole('Member');
      await loadOrganizationInsights(selectedOrganizationId);
      setStatus('Organization user added.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to add organization user.'));
    } finally {
      setAddingMember(false);
    }
  };

  const updateMemberRole = async (member: OrganizationMember, role: OrganizationMemberRole) => {
    setUpdatingMemberId(member.id);
    setStatus('');
    setError('');

    try {
      const response = await api.put(`/organizations/${member.organizationId}/members/${member.id}`, { role });
      const updated = normalizeMember(response.data);
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadOrganizationInsights(member.organizationId);
      setStatus('User role updated.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to update user role.'));
    } finally {
      setUpdatingMemberId('');
    }
  };

  const removeMember = async (member: OrganizationMember) => {
    setUpdatingMemberId(member.id);
    setStatus('');
    setError('');

    try {
      await api.delete(`/organizations/${member.organizationId}/members/${member.id}`);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      await loadOrganizationInsights(member.organizationId);
      setStatus('Organization user removed.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to remove organization user.'));
    } finally {
      setUpdatingMemberId('');
    }
  };

  const saveSettings = async () => {
    if (!selectedOrganizationId) {
      setError('Select an organization first.');
      return;
    }

    setSaving(true);
    setStatus('');
    setError('');

    try {
      const response = await api.put(`/organizations/${selectedOrganizationId}`, form);
      const updated = normalizeOrganization(response.data);
      setOrganizations((current) => current.map((organization) => (
        organization.id === updated.id ? updated : organization
      )));
      setForm(normalizeSettings(updated));
      await loadOrganizationInsights(updated.id);
      setStatus('Organization settings saved.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to save organization settings.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteOrganization = async () => {
    if (!selectedOrganization) {
      setError('Select an organization first.');
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedOrganization.name}? This removes the organization and its role assignments.`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setStatus('');
    setError('');

    try {
      await api.delete(`/organizations/${selectedOrganization.id}`);
      const remaining = organizations.filter((organization) => organization.id !== selectedOrganization.id);
      setOrganizations(remaining);

      const next = remaining[0];
      if (next) {
        selectOrganization(next);
      } else {
        setSelectedOrganizationId('');
        setMembers([]);
        setOrganizationUsage(null);
        setMeetingUsage(null);
        setAuditEvents([]);
        setForm(defaultForm);
      }

      setStatus('Organization deleted.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Unable to delete organization.'));
    } finally {
      setDeleting(false);
    }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setSigningIn(true);
    setError('');
    setStatus('');

    try {
      const response = await api.post('/auth/login', loginForm);
      persistSession(response.data);
      setLoginForm({ email: '', password: '' });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Login failed'));
    } finally {
      setSigningIn(false);
    }
  };

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    setSigningIn(true);
    setError('');
    setStatus('');

    if (registerForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      setSigningIn(false);
      return;
    }

    try {
      const response = await api.post('/auth/register', registerForm);
      persistSession(response.data);
      setRegisterForm({ firstName: '', lastName: '', email: '', password: '' });
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Registration failed'));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setToken('');
    setActiveUser(null);
    setOrganizations([]);
    setSelectedOrganizationId('');
    setMembers([]);
    setOrganizationUsage(null);
    setMeetingUsage(null);
    setAuditEvents([]);
    setUserQuery('');
    setUserResults([]);
    setSelectedUserId('');
    setForm(defaultForm);
    setError('');
    setStatus('');
  };

  const testStorage = async () => {
    if (!selectedOrganizationId) {
      setError('Select an organization first.');
      return;
    }

    setTesting(true);
    setStatus('');
    setError('');

    try {
      await api.post(`/organizations/${selectedOrganizationId}/storage/test`);
      await loadOrganizationInsights(selectedOrganizationId);
      setStatus('Storage path is writable.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Storage test failed'));
    } finally {
      setTesting(false);
    }
  };

  const hostOrganization = () => {
    if (!selectedOrganization || !selectedOrganizationUrl) {
      setError('Select an organization with an organization URL name first.');
      return;
    }

    window.open(selectedOrganizationUrl, '_blank', 'noopener,noreferrer');
    setStatus(`Hosted workspace opened for ${selectedOrganization.name}.`);
    setError('');
  };

  const copyHostedUrl = async () => {
    if (!selectedOrganizationUrl) {
      setError('Select an organization with an organization URL name first.');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedOrganizationUrl);
      setStatus('Hosted workspace URL copied.');
      setError('');
    } catch {
      setError(selectedOrganizationUrl);
    }
  };

  if (!token) {
    const isRegistering = authMode === 'register';

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
        <form onSubmit={isRegistering ? register : login} className="w-full max-w-md rounded-md border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <HandshakeMark />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Samvaad Admin</p>
              <h1 className="text-xl font-semibold">{isRegistering ? 'Create admin account' : 'Sign in'}</h1>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
              className={`rounded px-3 py-2 ${!isRegistering ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
              className={`rounded px-3 py-2 ${isRegistering ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {isRegistering && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">First name</span>
                  <input
                    value={registerForm.firstName}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, firstName: event.target.value }))}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Last name</span>
                  <input
                    value={registerForm.lastName}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, lastName: event.target.value }))}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={isRegistering ? registerForm.email : loginForm.email}
                onChange={(event) => {
                  if (isRegistering) {
                    setRegisterForm((current) => ({ ...current, email: event.target.value }));
                  } else {
                    setLoginForm((current) => ({ ...current, email: event.target.value }));
                  }
                }}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                value={isRegistering ? registerForm.password : loginForm.password}
                minLength={isRegistering ? 6 : undefined}
                onChange={(event) => {
                  if (isRegistering) {
                    setRegisterForm((current) => ({ ...current, password: event.target.value }));
                  } else {
                    setLoginForm((current) => ({ ...current, password: event.target.value }));
                  }
                }}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={signingIn}
            className="mt-5 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {signingIn ? 'Please wait...' : isRegistering ? 'Create admin account' : 'Sign in to admin'}
          </button>
          <p className="mt-4 text-sm text-slate-500">
            {isRegistering
              ? 'This creates a Samvaad account and opens the organization admin console.'
              : 'Use a Samvaad account that is allowed to manage organization settings.'}
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <HandshakeMark />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Samvaad Admin</p>
              <h1 className="text-xl font-semibold">Organizations</h1>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm">
            <p className="font-semibold">{activeUser?.firstName ? `${activeUser.firstName} ${activeUser.lastName || ''}` : 'Admin user'}</p>
            <p className="text-slate-500">{activeUser?.email || 'Uses your Samvaad session'}</p>
            <button type="button" onClick={signOut} className="mt-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Organization list</h2>
                  <p className="text-sm text-slate-500">{organizations.length} configured</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateForm((current) => !current)}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>

              {showCreateForm && (
                <form onSubmit={createOrganization} className="mt-4 rounded-md border border-indigo-100 bg-indigo-50 p-3">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Organization name</span>
                    <input
                      value={createForm.name}
                      onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                      required
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-sm font-medium text-slate-700">Organization URL name</span>
                    <input
                      value={createForm.slug}
                      onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="Leave empty to use organization name"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {createOrganizationUrl || 'URL will be generated from the organization name.'}
                    </span>
                  </label>
                  <label className="mt-3 block">
                    <span className="text-sm font-medium text-slate-700">Primary domain</span>
                    <input
                      value={createForm.primaryDomain}
                      onChange={(event) => setCreateForm((current) => ({ ...current, primaryDomain: event.target.value }))}
                      placeholder="example.com"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={creating}
                    className="mt-3 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create organization'}
                  </button>
                </form>
              )}

              <div className="mt-4 max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pr-1">
                {loading && organizations.length === 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    Loading organizations...
                  </div>
                )}

                {!loading && organizations.length === 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    No organizations yet.
                  </div>
                )}

                {organizations.map((organization) => {
                  const selected = organization.id === selectedOrganizationId;
                  return (
                    <button
                      key={organization.id}
                      type="button"
                      onClick={() => selectOrganization(organization)}
                      className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-200 text-sm font-bold text-slate-700">
                        {getInitials(organization.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-950">{organization.name}</span>
                        <span className="block truncate text-xs text-slate-500">{organization.primaryDomain || 'No domain set'}</span>
                        <span className="block truncate text-xs text-indigo-600">{organization.localAppUrl || buildLocalAppUrl(organization.slug, organization.name)}</span>
                        <span className="mt-1 block text-xs text-slate-400">Updated {formatDate(organization.updatedAt)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="rounded-md border border-indigo-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedOrganization?.name || 'Select an organization'}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    Configure storage, retention, file limits, guest access, and meeting defaults for the selected organization.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Estimated active storage: <span className="font-bold">{estimatedStorageGb} GB</span>
                  </div>
                  {selectedOrganization && (
                    <button
                      type="button"
                      onClick={hostOrganization}
                      className="rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Host organization
                    </button>
                  )}
                </div>
              </div>

              {(status || error) && (
                <div className={`mt-4 rounded-md px-4 py-3 text-sm font-medium ${
                  error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {error || status}
                </div>
              )}
            </div>

            {selectedOrganization ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Profile</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Organization name</span>
                        <input
                          value={form.name}
                          onChange={(event) => updateForm({ name: event.target.value })}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Primary email domain</span>
                        <input
                          value={form.primaryDomain}
                          onChange={(event) => updateForm({ primaryDomain: event.target.value })}
                          placeholder="example.com"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Organization URL name</span>
                        <input
                          value={form.slug}
                          onChange={(event) => updateForm({ slug: event.target.value })}
                          placeholder="Leave empty to use organization name"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                        <span className="mt-1 block text-xs text-slate-500">This becomes /org/{slugifyUrlName(form.slug || form.name) || 'organization'}.</span>
                      </label>
                      <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                        <span className="text-sm font-medium text-slate-700">Hosted workspace URL</span>
                        <p className="mt-1 truncate text-sm font-semibold text-indigo-700">{selectedOrganizationUrl || 'Save the organization to generate a URL'}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={hostOrganization}
                            className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            Open hosted app
                          </button>
                          <button
                            type="button"
                            onClick={copyHostedUrl}
                            className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            Copy URL
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold">Usage and billing</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Live organization usage from Samvaad meetings, chats, recordings, and admin activity.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectedOrganizationId && loadOrganizationInsights(selectedOrganizationId)}
                        disabled={!selectedOrganizationId || loadingInsights}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {loadingInsights ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[
                        ['Members', dashboardUsage.memberCount],
                        ['Meetings', meetingUsage?.totalMeetings || 0],
                        ['Upcoming', meetingUsage?.upcomingMeetings || 0],
                        ['Recordings', meetingUsage?.recordedMeetings || 0],
                        ['Conversations', meetingUsage?.conversations || 0],
                        ['Chat messages', meetingUsage?.chatMessages || 0],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-2xl font-semibold text-slate-950">{value}</p>
                          <p className="text-xs font-medium text-slate-500">{label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-lg font-semibold text-emerald-900">{dashboardUsage.estimatedActiveStorageGb} GB</p>
                        <p className="text-xs font-medium text-emerald-700">Estimated active storage</p>
                      </div>
                      <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
                        <p className="text-lg font-semibold text-sky-900">{formatBytes(meetingUsage?.attachmentBytes || 0)}</p>
                        <p className="text-xs font-medium text-sky-700">Known attachment usage</p>
                      </div>
                      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
                        <p className="text-lg font-semibold text-indigo-900">{dashboardUsage.auditEventsLast30Days}</p>
                        <p className="text-xs font-medium text-indigo-700">Audit events in 30 days</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">Roles: </span>
                        {roleSummary || 'No role distribution yet'}
                      </div>
                      <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">Last activity: </span>
                        {formatDateTime(organizationUsage?.lastActivityAt || meetingUsage?.lastMessageAt || meetingUsage?.lastMeetingAt)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Audit log</h3>
                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {loadingInsights && auditEvents.length === 0 && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          Loading audit events...
                        </p>
                      )}

                      {!loadingInsights && auditEvents.length === 0 && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          No audit events yet.
                        </p>
                      )}

                      {auditEvents.map((event) => (
                        <div key={event.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-slate-950">{event.action}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-700">{event.summary}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {event.actorEmail || 'System'} - {event.entityType}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Storage ownership</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {providerOptions.map((provider) => {
                        const selected = provider.value === form.storageProvider;
                        return (
                          <button
                            key={provider.value}
                            type="button"
                            onClick={() => updateForm({ storageProvider: provider.value })}
                            className={`rounded-md border px-4 py-3 text-left transition ${
                              selected
                                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <span className="block text-sm font-semibold">{provider.title}</span>
                            <span className="mt-1 block text-xs leading-snug text-slate-500">{provider.description}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Storage root path</span>
                        <input
                          value={form.storageRootPath}
                          onChange={(event) => updateForm({ storageRootPath: event.target.value })}
                          placeholder={form.storageProvider === 'CustomerPremises' ? String.raw`\\fileserver\samvaad` : 'D:\\SamvaadStorage or mounted bucket path'}
                          disabled={form.storageProvider === 'ApplicationLocal'}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Public base URL</span>
                        <input
                          value={form.publicBaseUrl}
                          onChange={(event) => updateForm({ publicBaseUrl: event.target.value })}
                          placeholder="https://cdn.customer.com/samvaad"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Cost controls</h3>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {[
                        ['recordingRetentionDays', 'Recording retention days', 1, 3650],
                        ['attachmentRetentionDays', 'Attachment retention days', 1, 3650],
                        ['maxRecordingMegabytes', 'Max recording size MB', 25, 4096],
                        ['maxAttachmentMegabytes', 'Max attachment size MB', 1, 512],
                      ].map(([key, label, min, max]) => (
                        <label key={key} className="block">
                          <span className="text-sm font-medium text-slate-700">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            value={Number(form[key as keyof OrganizationSettingsForm])}
                            onChange={(event) => updateForm({ [key]: Number(event.target.value) } as Partial<OrganizationSettingsForm>)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-5">
                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">Users and roles</h3>
                        <p className="mt-1 text-sm text-slate-500">{members.length} users in this organization</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Search Samvaad users</span>
                        <input
                          value={userQuery}
                          onChange={(event) => setUserQuery(event.target.value)}
                          placeholder="Name or email"
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                      </label>

                      <div className="max-h-36 space-y-2 overflow-y-auto">
                        {searchingUsers && (
                          <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">Searching...</p>
                        )}

                        {!searchingUsers && userQuery.trim().length >= 2 && userResults.length === 0 && (
                          <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">No users found.</p>
                        )}

                        {userResults.map((user) => {
                          const selected = user.id === selectedUserId;
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => setSelectedUserId(user.id)}
                              className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left ${
                                selected
                                  ? 'border-indigo-500 bg-indigo-50'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                                {getInitials(getUserDisplayName(user))}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">{getUserDisplayName(user)}</span>
                                <span className="block truncate text-xs text-slate-500">{user.email}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          value={newMemberRole}
                          onChange={(event) => setNewMemberRole(event.target.value as OrganizationMemberRole)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                          {memberRoleOptions.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={addMember}
                          disabled={!selectedUserId || addingMember}
                          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {addingMember ? 'Adding...' : 'Add user'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {loadingMembers && members.length === 0 && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          Loading users...
                        </p>
                      )}

                      {!loadingMembers && members.length === 0 && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                          No users added yet.
                        </p>
                      )}

                      {members.map((member) => (
                        <div key={member.id} className="rounded-md border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                              {getInitials(member.displayName)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-950">{member.displayName}</p>
                              <p className="truncate text-xs text-slate-500">{member.email}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                            <select
                              value={member.role}
                              disabled={updatingMemberId === member.id}
                              onChange={(event) => updateMemberRole(member, event.target.value as OrganizationMemberRole)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                            >
                              {memberRoleOptions.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeMember(member)}
                              disabled={updatingMemberId === member.id}
                              className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Meeting defaults</h3>
                    <div className="mt-4 space-y-3">
                      {[
                        ['enableRecordingByDefault', 'Enable recording by default'],
                        ['requireLobbyByDefault', 'Require lobby by default'],
                        ['allowExternalGuests', 'Allow external guests'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                          <span className="text-sm font-medium text-slate-700">{label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(form[key as keyof OrganizationSettingsForm])}
                            onChange={(event) => updateForm({ [key]: event.target.checked } as Partial<OrganizationSettingsForm>)}
                            className="h-4 w-4"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">Selected storage</h3>
                    <p className="mt-2 text-sm font-semibold text-indigo-700">{selectedProvider.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{selectedProvider.description}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <p>Recordings: {form.recordingRetentionDays} days</p>
                      <p>Attachments: {form.attachmentRetentionDays} days</p>
                      <p>Max recording: {form.maxRecordingMegabytes} MB</p>
                      <p>Max attachment: {form.maxAttachmentMegabytes} MB</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <button
                      type="button"
                      onClick={testStorage}
                      disabled={testing || loading}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {testing ? 'Testing...' : 'Test storage'}
                    </button>
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={saving || loading}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save organization'}
                    </button>
                  </div>

                  <div className="rounded-md border border-red-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-red-700">Danger zone</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Delete this organization and its role assignments.
                    </p>
                    <button
                      type="button"
                      onClick={deleteOrganization}
                      disabled={deleting || loading}
                      className="mt-4 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Delete organization'}
                    </button>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
                Select or add an organization.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
