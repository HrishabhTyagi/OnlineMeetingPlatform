export type PresenceStatus = 'Available' | 'Busy' | 'DoNotDisturb' | 'BeRightBack' | 'Away' | 'Offline' | 'InMeeting' | 'Presenting';
export type WorkspaceKind = 'personal' | 'organization';

export interface SamvaadUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  status?: PresenceStatus | string;
}

export interface AuthSession {
  token: string;
  user: SamvaadUser;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  primaryDomain?: string;
  localAppUrl?: string;
}

export interface Workspace {
  kind: WorkspaceKind;
  id: string;
  name: string;
  slug?: string;
  organization?: Organization;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  meetingLink?: string;
  status?: 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
  organizerId?: string;
  organizerName?: string;
}

export interface MeetingParticipant {
  id: string;
  userId?: string;
  userName: string;
  email?: string;
  role?: string;
  status?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  screenSharing?: boolean;
  isHandRaised?: boolean;
  reaction?: string;
}

export interface Conversation {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  lastMessage?: string;
  unreadCount?: number;
  participants?: SamvaadUser[];
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  senderId?: string;
  senderName?: string;
  message?: string;
  content?: string;
  sentAt?: string;
  createdAt?: string;
  editedAt?: string;
  isImportant?: boolean;
  isPinned?: boolean;
  attachmentFileName?: string;
  attachmentUrl?: string;
  attachmentContentType?: string;
  reactions?: Array<{ emoji: string; count?: number; userIds?: string[] }>;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeName?: string;
  ownerName?: string;
  sourceMessageId?: string;
}

export interface RecordingItem {
  id?: string;
  meetingId?: string;
  fileName?: string;
  recordingUrl?: string;
  url?: string;
  createdAt?: string;
  durationSeconds?: number;
}

export interface CalendarConnection {
  provider: string;
  status?: string;
  connectedAt?: string;
  accountEmail?: string;
}

export interface TeamSpace {
  id: string;
  name: string;
  description?: string;
  channels?: Array<{ id: string; name: string }>;
}
