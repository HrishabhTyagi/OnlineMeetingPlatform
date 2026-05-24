import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent, type SVGProps } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { ProfileStatusMenu, UserAvatar, UserStatusBadge, UserStatus } from '../components/UserStatus';
import { conversationAPI, getMeetingJoinUrl, getOrganizationScopedPath, meetingAPI, openMeetingJoinInNewTab, openUrlInNewTab, resolveApiAssetUrl, userAPI } from '../services/api';
import {
  initializeSignalR,
  joinConversation,
  joinUserNotifications,
  leaveConversation,
  notifyUserStatusChanged,
  onConversationMessageReceived,
  onConversationMessageReactionUpdated,
  onConversationMessageUpdated,
  onIncomingCallResponse,
  onUserStatusChanged,
  startSignalR,
} from '../services/signalR';
import { useAuthStore } from '../store/authStore';

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  profilePictureUrl?: string;
  phoneNumber?: string;
  status?: string;
}

interface ConversationMember {
  userId: string;
  userEmail: string;
  userName: string;
}

interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  clientMessageId?: string;
  message: string;
  attachmentFileName?: string;
  attachmentUrl?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreview?: string;
  sentAt: string;
  editedAt?: string;
  isPinned?: boolean;
  isImportant?: boolean;
  reactions?: ConversationMessageReaction[];
  deliveryStatus?: 'pending' | 'retrying' | 'failed' | 'sent';
  deliveryError?: string;
}

interface ConversationMessageReaction {
  id: string;
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
}

interface ScheduledConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  message: string;
  scheduledFor: string;
  createdAt: string;
  status: string;
}

interface ConversationTaskNote {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  note: string;
  createdAt: string;
}

interface ConversationTaskActivity {
  id: string;
  taskId: string;
  actorId: string;
  actorName: string;
  action: string;
  details?: string;
  createdAt: string;
}

interface ConversationTask {
  id: string;
  conversationId: string;
  sourceMessageId?: string;
  title: string;
  description?: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  status: 'Pending' | 'InProgress' | 'Completed';
  ownerId: string;
  ownerName: string;
  assigneeId?: string;
  assigneeEmail?: string;
  assigneeName?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  sourceMessagePreview?: string;
  notes?: ConversationTaskNote[];
  activities?: ConversationTaskActivity[];
}

interface GlobalSearchResult {
  kind: string;
  id: string;
  conversationId?: string;
  meetingId?: string;
  title: string;
  snippet?: string;
  occurredAt?: string;
}

interface ConversationInvite {
  id: string;
  email: string;
  hasAccepted: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  type: 'Direct' | 'Group';
  title?: string;
  members: ConversationMember[];
  invites?: ConversationInvite[];
  lastMessage?: ConversationMessage;
  unreadCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface MeetingCallLog {
  id: string;
  meetingId: string;
  meetingTitle?: string;
  meetingStartTime?: string;
  meetingEndTime?: string;
  conversationId?: string;
  callerUserId: string;
  callerName: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
  callType: 'audio' | 'video';
  joinUrl?: string;
  status: 'Ringing' | 'Accepted' | 'Declined' | 'Cancelled' | 'NoResponse' | 'Failed';
  statusReason?: string;
  cancellationMessage?: string;
  isSeen: boolean;
  createdAt: string;
  statusChangedAt?: string;
}

interface QueuedChatMessage {
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  message: string;
  isImportant?: boolean;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToPreview?: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  status: 'pending' | 'retrying' | 'failed';
  lastError?: string;
}

function displayUser(user: UserSummary) {
  return user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function formatMessageTime(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatConversationDate(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatScheduledDate(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCallStatusLabel(call: MeetingCallLog, currentUserId?: string) {
  const incoming = call.recipientUserId === currentUserId;
  if (call.status === 'NoResponse') {
    return incoming ? 'Missed' : 'No response';
  }

  return call.status;
}

function getCallStatusClass(call: MeetingCallLog, currentUserId?: string) {
  const incoming = call.recipientUserId === currentUserId;
  if (call.status === 'Accepted') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  }

  if (call.status === 'Cancelled') {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  if (call.status === 'Declined' || call.status === 'Failed' || (call.status === 'NoResponse' && incoming)) {
    return 'bg-rose-50 text-rose-700 ring-rose-100';
  }

  return 'bg-amber-50 text-amber-700 ring-amber-100';
}

function formatTaskStatus(value?: string) {
  return (value || 'Pending').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function getTaskPriorityClass(priority?: string) {
  switch (priority) {
    case 'Urgent':
      return 'bg-red-50 text-red-700 ring-red-100';
    case 'High':
      return 'bg-orange-50 text-orange-700 ring-orange-100';
    case 'Low':
      return 'bg-slate-50 text-slate-600 ring-slate-200';
    default:
      return 'bg-teal-50 text-teal-700 ring-teal-100';
  }
}

function getTaskStatusClass(status?: string) {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
    case 'InProgress':
      return 'bg-blue-50 text-blue-700 ring-blue-100';
    default:
      return 'bg-amber-50 text-amber-700 ring-amber-100';
  }
}

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

function describeLastMessage(message: ConversationMessage | undefined, memberCount: number) {
  if (!message) {
    return `${memberCount} member chat`;
  }

  if (message.attachmentFileName && message.message) {
    return `${message.message} - ${message.attachmentFileName}`;
  }

  if (message.attachmentFileName) {
    return `Shared ${message.attachmentFileName}`;
  }

  return message.message;
}

function getMessagePreview(message: ConversationMessage) {
  if (message.message.trim()) {
    return message.message.trim().replace(/\s+/g, ' ').slice(0, 140);
  }

  if (message.attachmentFileName) {
    return `Shared ${message.attachmentFileName}`;
  }

  return 'Message';
}

function formatUnreadCount(count?: number) {
  const unreadCount = count || 0;
  return unreadCount > 99 ? '99+' : unreadCount.toString();
}

function sortConversationsByActivity(items: Conversation[]) {
  return [...items].sort((a, b) => {
    const first = Date.parse(a.lastMessage?.sentAt || a.updatedAt || a.createdAt || '');
    const second = Date.parse(b.lastMessage?.sentAt || b.updatedAt || b.createdAt || '');
    return (Number.isNaN(second) ? 0 : second) - (Number.isNaN(first) ? 0 : first);
  });
}

const CHAT_OUTBOX_KEY_PREFIX = 'samvaadChatOutbox';

function getChatOutboxKey(userId: string) {
  return `${CHAT_OUTBOX_KEY_PREFIX}:${userId}`;
}

function readQueuedChatMessages(userId?: string): QueuedChatMessage[] {
  if (!userId) {
    return [];
  }

  try {
    const value = localStorage.getItem(getChatOutboxKey(userId));
    const items = value ? JSON.parse(value) as QueuedChatMessage[] : [];
    return Array.isArray(items)
      ? items
          .filter((item) => item.clientMessageId && item.conversationId && item.message)
          .map((item) => ({ ...item, status: item.status === 'retrying' ? 'failed' : item.status }))
      : [];
  } catch {
    return [];
  }
}

function writeQueuedChatMessages(userId: string | undefined, items: QueuedChatMessage[]) {
  if (!userId) {
    return;
  }

  try {
    const key = getChatOutboxKey(userId);
    if (items.length === 0) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // If storage is full or blocked, the live in-memory queue still keeps retrying for this session.
  }
}

function createClientMessageId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `msg-${Date.now().toString(36)}-${random}`;
}

function retryDelayMs(attempts: number) {
  return Math.min(60000, Math.max(3000, 3000 * 2 ** Math.min(attempts, 4)));
}

function isRetryableSendError(err: any) {
  const status = err?.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

function getSendErrorText(err: any) {
  return err?.response?.data?.message || err?.response?.data || err?.message || 'Unable to send yet';
}

function queuedMessageToConversationMessage(item: QueuedChatMessage): ConversationMessage {
  return {
    id: item.clientMessageId,
    conversationId: item.conversationId,
    senderId: item.senderId,
    senderName: item.senderName,
    clientMessageId: item.clientMessageId,
    message: item.message,
    isImportant: item.isImportant,
    replyToMessageId: item.replyToMessageId,
    replyToSenderName: item.replyToSenderName,
    replyToPreview: item.replyToPreview,
    sentAt: item.createdAt,
    reactions: [],
    deliveryStatus: item.status,
    deliveryError: item.lastError,
  };
}

function mergeServerAndQueuedMessages(serverMessages: ConversationMessage[], queuedMessages: QueuedChatMessage[], conversationId: string) {
  const serverClientIds = new Set(serverMessages.map((message) => message.clientMessageId).filter(Boolean));
  const pendingMessages = queuedMessages
    .filter((item) => item.conversationId === conversationId && !serverClientIds.has(item.clientMessageId))
    .map(queuedMessageToConversationMessage);

  return [...serverMessages, ...pendingMessages].sort((left, right) => (
    new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime()
  ));
}

function isImageAttachment(message: ConversationMessage) {
  return !!message.attachmentUrl && !!message.attachmentContentType?.startsWith('image/');
}

const QUICK_REACTIONS = ['👍', '❤️', '😆', '😮'];
const EXTRA_REACTIONS = ['👏', '🔥', '🎉', '🙏', '💡', '✅'];

function summarizeReactions(reactions?: ConversationMessageReaction[]) {
  const summary = new Map<string, ConversationMessageReaction[]>();
  (reactions || []).forEach((reaction) => {
    const items = summary.get(reaction.emoji) || [];
    items.push(reaction);
    summary.set(reaction.emoji, items);
  });
  return Array.from(summary.entries());
}

function normalizeReaction(data: any): ConversationMessageReaction {
  return {
    id: data.id || data.Id,
    messageId: data.messageId || data.MessageId,
    userId: data.userId || data.UserId,
    userName: data.userName || data.UserName,
    emoji: data.emoji || data.Emoji,
    createdAt: data.createdAt || data.CreatedAt,
  };
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : value;
}

function looksLikeCode(value: string) {
  const lines = value.split('\n');
  if (lines.length < 2) {
    return false;
  }

  return lines.some((line) => /^\s*(#include|using\s|import\s|function\s|class\s|public\s|private\s|const\s|let\s|var\s|if\s*\(|for\s*\(|while\s*\(|return\b|int\s+main|printf|<\/?\w|[{};])/.test(line))
    || lines.some((line) => /^\s{2,}\S/.test(line));
}

function linkifyMessageText(value: string, isMine: boolean) {
  return value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part.startsWith('http')) {
      return part;
    }

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-semibold underline underline-offset-2 ${isMine ? 'text-white' : 'text-blue-700'}`}
      >
        {part}
      </a>
    );
  });
}

function FormattedMessage({ message, isMine }: { message: string; isMine: boolean }) {
  if (looksLikeCode(message) || message.trim().startsWith('```')) {
    return (
      <pre className={`mt-1 max-h-96 overflow-auto rounded-md border px-3 py-2 text-left font-mono text-xs leading-relaxed ${isMine ? 'border-white/20 bg-blue-700 text-white' : 'border-slate-200 bg-slate-950 text-slate-100'}`}>
        <code className="whitespace-pre">{stripCodeFence(message)}</code>
      </pre>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {linkifyMessageText(message, isMine)}
    </p>
  );
}

function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M21 11.5 12.1 20.4a6 6 0 0 1-8.5-8.5l9.3-9.3a4 4 0 1 1 5.7 5.7L9.2 17.7a2 2 0 0 1-2.8-2.8l8.5-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m8 16 3.2-3.2 2.5 2.5L16 13l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9.2h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m4 5 16 7-16 7 3-7-3-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 12h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m4 20 4.4-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m14.5 7.1 2.4 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SmilePlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M14.5 19.2A8.2 8.2 0 1 1 19.2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 10h.01M13.5 10h.01M8.8 14.2c1.1 1.1 2.9 1.1 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 15v6M15 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MoreHorizontalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ReplyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M10 8 5 13l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13h9a5 5 0 0 1 5 5v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ForwardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m14 8 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19v-1a5 5 0 0 1 5-5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 7.5 12 6a4 4 0 0 1 5.7 5.7l-1.5 1.5M13.5 16.5 12 18a4 4 0 0 1-5.7-5.7l1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 7h14M10 11v6M14 11v6M9 7l.7-2h4.6L15 7M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m14 4 6 6-3 1-4 4v4l-2 2-2-6-6-2 2-2h4l4-4 1-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UnreadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 6.5h16v11H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 5h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TranslateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 5h9M8.5 5v2.5M11.5 19l4-9 4 9M13 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 8.5c-.9 2.7-2.9 5.2-6.5 6.5M6.2 9.5c1.1 1.8 2.8 3.5 5.3 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 6.5h14M5 12h14M5 17.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m4.5 12 1.2 1.2L8 10.8M4.5 17.5l1.2 1.2L8 16.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ImportantIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 4v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 19h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function VideoCallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h6.5A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-9Z" fill="currentColor" />
      <path d="m16 10 4-2.5v9L16 14v-4Z" fill="currentColor" />
    </svg>
  );
}

function PhoneCallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7.2 4.5 9.7 7c.7.7.8 1.8.2 2.6l-1 1.3c1 2 2.5 3.5 4.5 4.5l1.3-1c.8-.6 1.9-.5 2.6.2l2.5 2.5c.5.5.6 1.3.2 1.9-.8 1.2-2.2 1.8-3.6 1.4-6.2-1.5-11-6.3-12.5-12.5-.3-1.4.2-2.8 1.4-3.6.6-.4 1.4-.3 1.9.2Z" fill="currentColor" />
    </svg>
  );
}

function PeoplePlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9.5 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3.5 20a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 8.5a3 3 0 1 1-1.2 5.8M18.5 16v5M16 18.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M10.8 18.1a7.3 7.3 0 1 0 0-14.6 7.3 7.3 0 0 0 0 14.6ZM16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Chat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quickGroupInputRef = useRef<HTMLInputElement | null>(null);
  const queuedMessagesRef = useRef<QueuedChatMessage[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  const retryingOutboxRef = useRef(false);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentStatus, setAttachmentStatus] = useState('');
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [sending, setSending] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [quickGroupQuery, setQuickGroupQuery] = useState('');
  const [quickGroupSelectedUsers, setQuickGroupSelectedUsers] = useState<UserSummary[]>([]);
  const [quickGroupStatus, setQuickGroupStatus] = useState('');
  const [creatingQuickGroup, setCreatingQuickGroup] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'photos' | 'tasks' | 'calls'>('chat');
  const [startingCall, setStartingCall] = useState<'audio' | 'video' | null>(null);
  const [callHistory, setCallHistory] = useState<MeetingCallLog[]>([]);
  const [callHistoryLoading, setCallHistoryLoading] = useState(false);
  const [callHistoryError, setCallHistoryError] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editImportant, setEditImportant] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<ConversationMessage | null>(null);
  const [messageActionStatus, setMessageActionStatus] = useState('');
  const [translationMessageId, setTranslationMessageId] = useState<string | null>(null);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledConversationMessage[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 15 * 60000)));
  const [scheduling, setScheduling] = useState(false);
  const [tasks, setTasks] = useState<ConversationTask[]>([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState('All');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('All');
  const [taskQuery, setTaskQuery] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState('');
  const [taskPriorityDraft, setTaskPriorityDraft] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
  const [taskAssigneeDraft, setTaskAssigneeDraft] = useState('');
  const [taskDueDraft, setTaskDueDraft] = useState('');
  const [taskSourceMessage, setTaskSourceMessage] = useState<ConversationMessage | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskNoteDrafts, setTaskNoteDrafts] = useState<Record<string, string>>({});
  const [highlightMessageId, setHighlightMessageId] = useState(searchParams.get('messageId'));
  const [importantDraft, setImportantDraft] = useState(false);
  const [shareMessage, setShareMessage] = useState<ConversationMessage | null>(null);
  const [shareEmailsDraft, setShareEmailsDraft] = useState('');
  const [shareNoteDraft, setShareNoteDraft] = useState('');
  const [sharingDocument, setSharingDocument] = useState(false);
  const [documentPreview, setDocumentPreview] = useState<ConversationMessage | null>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');
  const [documentPreviewError, setDocumentPreviewError] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searchingGlobally, setSearchingGlobally] = useState(false);
  const pendingFilePreviews = useMemo(
    () => pendingFiles.map((file) => ({
      file,
      previewUrl: isImageFile(file) ? URL.createObjectURL(file) : '',
    })),
    [pendingFiles],
  );

  useEffect(() => () => {
    pendingFilePreviews.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }, [pendingFilePreviews]);

  useEffect(() => {
    if (!documentPreview) {
      setDocumentPreviewUrl('');
      setDocumentPreviewError('');
      return;
    }

    let objectUrl = '';
    conversationAPI.previewAttachment(documentPreview.conversationId, documentPreview.id)
      .then((response) => {
        objectUrl = URL.createObjectURL(new Blob([response.data], { type: documentPreview.attachmentContentType || 'application/octet-stream' }));
        setDocumentPreviewUrl(objectUrl);
        setDocumentPreviewError('');
      })
      .catch(() => {
        setDocumentPreviewUrl('');
        setDocumentPreviewError('Preview is unavailable for this file.');
      });

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [documentPreview]);

  const displayName = useMemo(() => {
    if (!user) {
      return 'User';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  const requestedConversationId = searchParams.get('conversationId');
  const selectedPeople = users.filter((item) => selectedUserIds.includes(item.id));
  const normalizedQuery = userQuery.trim().toLowerCase();
  const canAddEmailInvite = isEmail(userQuery)
    && !inviteEmails.some((email) => email.toLowerCase() === normalizedQuery)
    && !users.some((item) => item.email.toLowerCase() === normalizedQuery);
  const recipientCount = selectedUserIds.length + inviteEmails.length;
  const quickGroupEmail = quickGroupQuery.trim();
  const quickGroupCanInviteEmail = isEmail(quickGroupEmail)
    && !quickGroupSelectedUsers.some((item) => item.email.toLowerCase() === quickGroupEmail.toLowerCase())
    && !users.some((item) => item.email.toLowerCase() === quickGroupEmail.toLowerCase());
  const quickGroupCanCreate = quickGroupSelectedUsers.length > 0 || quickGroupCanInviteEmail;
  const quickGroupCandidates = users
    .filter((item) => item.id !== user?.id)
    .filter((item) => !quickGroupSelectedUsers.some((selected) => selected.id === item.id))
    .slice(0, 5);

  const getOtherMember = (conversation: Conversation) => conversation.members.find((member) => member.userId !== user?.id);

  const getConversationTitle = (conversation: Conversation) => {
    const otherMember = getOtherMember(conversation);
    if (conversation.type === 'Group') {
      return conversation.title || 'Group chat';
    }

    return otherMember?.userName
      || conversation.invites?.find((invite) => !invite.hasAccepted)?.email
      || 'Direct chat';
  };

  const filteredConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = getConversationTitle(conversation).toLowerCase();
      const memberMatch = conversation.members.some((member) => (
        member.userName.toLowerCase().includes(query)
        || member.userEmail.toLowerCase().includes(query)
      ));
      const inviteMatch = conversation.invites?.some((invite) => invite.email.toLowerCase().includes(query));
      return title.includes(query) || memberMatch || inviteMatch;
    });
  }, [chatSearch, conversations, user?.id]);

  const pinnedConversations = filteredConversations.slice(0, 1);
  const recentConversations = filteredConversations.slice(1);
  const pendingRequestCount = conversations.reduce((count, conversation) => (
    count + (conversation.invites || []).filter((invite) => !invite.hasAccepted).length
  ), 0);
  const selectedFiles = messages.filter((message) => message.attachmentUrl);
  const selectedPhotos = selectedFiles.filter(isImageAttachment);
  const unseenCallCount = callHistory.filter((call) => !call.isSeen).length;
  const queuedMessageCount = queuedMessages.length;
  const filteredTasks = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = taskStatusFilter === 'All' || task.status === taskStatusFilter;
      const matchesPriority = taskPriorityFilter === 'All' || task.priority === taskPriorityFilter;
      const matchesQuery = !query
        || task.title.toLowerCase().includes(query)
        || (task.description || '').toLowerCase().includes(query)
        || (task.assigneeName || task.assigneeEmail || '').toLowerCase().includes(query);
      return matchesStatus && matchesPriority && matchesQuery;
    });
  }, [taskPriorityFilter, taskQuery, taskStatusFilter, tasks]);
  const importantMessages = messages.filter((message) => message.isImportant);
  const pinnedMessages = messages.filter((message) => message.isPinned);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!user?.id) {
      setQueuedMessages([]);
      queuedMessagesRef.current = [];
      return;
    }

    const storedMessages = readQueuedChatMessages(user.id);
    queuedMessagesRef.current = storedMessages;
    setQueuedMessages(storedMessages);
  }, [user?.id]);

  useEffect(() => {
    queuedMessagesRef.current = queuedMessages;
    writeQueuedChatMessages(user?.id, queuedMessages);
  }, [queuedMessages, user?.id]);

  const getUserStatus = (userId?: string) => {
    if (!userId) {
      return 'Offline';
    }

    if (statusOverrides[userId]) {
      return statusOverrides[userId];
    }

    if (user?.id === userId) {
      return user.status || 'Available';
    }

    return users.find((item) => item.id === userId)?.status || 'Available';
  };

  const getUserAvatar = (userId?: string) => {
    if (!userId) {
      return undefined;
    }

    if (user?.id === userId) {
      return user.profilePictureUrl;
    }

    return users.find((item) => item.id === userId)?.profilePictureUrl
      || accounts.find((account) => account.user.id === userId)?.user.profilePictureUrl;
  };

  const refreshConversations = async () => {
    const response = await conversationAPI.getConversations();
    setConversations(sortConversationsByActivity(response.data));
    return response.data as Conversation[];
  };

  const clearConversationUnread = (conversationId: string) => {
    setConversations((items) => items.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )));
  };

  const markConversationRead = async (conversationId: string) => {
    clearConversationUnread(conversationId);
    await conversationAPI.markAsRead(conversationId).catch(() => undefined);
  };

  const selectedTitle = useMemo(() => {
    if (!selectedConversation || !user) {
      return 'Select a chat';
    }

    if (selectedConversation.type === 'Group') {
      return selectedConversation.title || 'Group chat';
    }

    return selectedConversation.members.find((member) => member.userId !== user.id)?.userName
      || selectedConversation.invites?.find((invite) => !invite.hasAccepted)?.email
      || 'Direct chat';
  }, [selectedConversation, user]);

  const loadConversationCallHistory = useCallback(async () => {
    if (!selectedConversationId) {
      setCallHistory([]);
      setCallHistoryError('');
      return;
    }

    setCallHistoryLoading(true);
    setCallHistoryError('');
    try {
      const response = await meetingAPI.getRecentCallLogs('All');
      setCallHistory((response.data as MeetingCallLog[])
        .filter((call) => call.conversationId === selectedConversationId));
    } catch {
      setCallHistory([]);
      setCallHistoryError('Unable to load call history');
    } finally {
      setCallHistoryLoading(false);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const load = async () => {
      try {
        const [conversationResponse, userResponse, profileResponse] = await Promise.all([
          conversationAPI.getConversations(),
          userAPI.searchUsers(),
          userAPI.getProfile().catch(() => ({ data: user })),
        ]);
        setError('');
        setConversations(sortConversationsByActivity(conversationResponse.data));
        setUsers(userResponse.data);
        if (profileResponse.data) {
          setUser(profileResponse.data);
        }
        const requestedConversation = conversationResponse.data.find((conversation: Conversation) => conversation.id === requestedConversationId);
        setSelectedConversationId(requestedConversation?.id || conversationResponse.data[0]?.id || null);
      } catch {
        setError('Unable to load chats');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, user?.id, setUser]);

  useEffect(() => {
    loadConversationCallHistory();
  }, [loadConversationCallHistory]);

  useEffect(() => {
    if (!requestedConversationId || selectedConversationId === requestedConversationId) {
      return;
    }

    if (conversations.some((conversation) => conversation.id === requestedConversationId)) {
      setSelectedConversationId(requestedConversationId);
    }
  }, [conversations, requestedConversationId, selectedConversationId]);

  useEffect(() => {
    setHighlightMessageId(searchParams.get('messageId'));
  }, [searchParams]);

  useEffect(() => {
    if (!highlightMessageId || activeTab !== 'chat') {
      return;
    }

    const timer = window.setTimeout(() => {
      document.getElementById(`message-${highlightMessageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [activeTab, highlightMessageId, messages]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let cancelled = false;
    let unsubscribeConversationMessage: () => void = () => undefined;
    let unsubscribeConversationUpdate: () => void = () => undefined;
    let unsubscribeConversationReactionUpdate: () => void = () => undefined;

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        if (cancelled) {
          return;
        }

        await joinUserNotifications(user.id);
        onUserStatusChanged((data) => {
          setStatusOverrides((items) => ({ ...items, [data.userId]: data.status }));
          setUsers((items) => items.map((item) => (
            item.id === data.userId ? { ...item, status: data.status } : item
          )));

          if (data.userId === user.id) {
            setUser({ ...user, status: data.status });
          }
        });
        unsubscribeConversationMessage = onConversationMessageReceived((data) => {
          if (data.senderId === user.id) {
            return;
          }

          const incoming: ConversationMessage = {
            id: data.id || `${data.conversationId}-${data.senderId}-${data.timestamp}`,
            conversationId: data.conversationId,
            senderId: data.senderId,
            senderName: data.senderName,
            message: data.message || '',
            attachmentFileName: data.attachmentFileName,
            attachmentUrl: data.attachmentUrl,
            attachmentContentType: data.attachmentContentType,
            attachmentSizeBytes: data.attachmentSizeBytes,
            replyToMessageId: data.replyToMessageId || data.ReplyToMessageId,
            replyToSenderName: data.replyToSenderName || data.ReplyToSenderName,
            replyToPreview: data.replyToPreview || data.ReplyToPreview,
            sentAt: data.timestamp,
            isPinned: Boolean(data.isPinned || data.IsPinned),
            isImportant: Boolean(data.isImportant || data.IsImportant),
            reactions: [],
          };

          setConversations((items) => {
            const hasConversation = items.some((conversation) => conversation.id === data.conversationId);
            if (!hasConversation) {
              refreshConversations().catch(() => undefined);
              return items;
            }

            const isOpenConversation = selectedConversationId === data.conversationId;
            const updated = items.map((conversation) => {
              if (conversation.id !== data.conversationId) {
                return conversation;
              }

              if (conversation.lastMessage?.id === incoming.id) {
                return conversation;
              }

              return {
                ...conversation,
                lastMessage: incoming,
                updatedAt: incoming.sentAt,
                unreadCount: isOpenConversation ? 0 : (conversation.unreadCount || 0) + 1,
              };
            });

            return sortConversationsByActivity(updated);
          });

          setMessages((items) => {
            if (selectedConversationId !== data.conversationId || items.some((message) => message.id === incoming.id)) {
              return items;
            }

            return [...items, incoming];
          });

          if (selectedConversationId === data.conversationId) {
            markConversationRead(data.conversationId).catch(() => undefined);
          }
        });
        unsubscribeConversationUpdate = onConversationMessageUpdated((data) => {
          const messageId = data.id || data.Id;
          const conversationId = data.conversationId || data.ConversationId;
          const messageText = data.message ?? data.Message ?? '';
          const editedAt = data.editedAt || data.EditedAt || data.timestamp || data.Timestamp;
          const senderId = data.senderId || data.SenderId;
          const senderName = data.senderName || data.SenderName;
          const isImportant = data.isImportant ?? data.IsImportant;

          if (!messageId || !conversationId) {
            return;
          }

          setMessages((items) => items.map((item) => (
            item.id === messageId
              ? {
                  ...item,
                  conversationId,
                  senderId: senderId || item.senderId,
                  senderName: senderName || item.senderName,
                  message: messageText,
                  editedAt,
                  isImportant: typeof isImportant === 'boolean' ? isImportant : item.isImportant,
                }
              : item
          )));

          setConversations((items) => items.map((conversation) => {
            const lastMessage = conversation.lastMessage;
            if (!lastMessage || lastMessage.id !== messageId) {
              return conversation;
            }

            return {
              ...conversation,
              lastMessage: {
                ...lastMessage,
                message: messageText,
                editedAt,
                isImportant: typeof isImportant === 'boolean' ? isImportant : lastMessage.isImportant,
              },
              updatedAt: editedAt || conversation.updatedAt,
            };
          }));
        });
        unsubscribeConversationReactionUpdate = onConversationMessageReactionUpdated((data) => {
          const messageId = data.messageId || data.MessageId;
          const reactions = data.reactions || data.Reactions || [];

          if (!messageId) {
            return;
          }

          updateMessageReactions(messageId, reactions.map(normalizeReaction));
        });
        onIncomingCallResponse((data) => {
          const conversationId = data.conversationId || data.ConversationId;
          if (!conversationId || conversationId === selectedConversationId) {
            loadConversationCallHistory().catch(() => undefined);
          }
        });
      })
      .catch((err) => console.warn('Chat SignalR connection failed', err));

    return () => {
      cancelled = true;
      unsubscribeConversationMessage();
      unsubscribeConversationUpdate();
      unsubscribeConversationReactionUpdate();
    };
  }, [loadConversationCallHistory, selectedConversationId, token, user, setUser]);

  const handleStatusChange = async (status: UserStatus) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    setUser({ ...user, status });

    try {
      const response = await userAPI.updateStatus(status);
      setUser(response.data);
      await notifyUserStatusChanged(user.id, displayName, response.data.status).catch(() => undefined);
    } catch {
      setUser(previousUser);
    }
  };

  const handleAvatarChange = async (file: File) => {
    const data = new FormData();
    data.append('file', file);
    setAvatarUploading(true);

    try {
      const response = await userAPI.uploadAvatar(data);
      setUser(response.data);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    try {
      const response = await userAPI.removeAvatar();
      setUser(response.data);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSignOut = () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    logout();
    if (!hadOtherAccounts) {
      navigate('/login', { replace: true });
    }
  };

  const handleSwitchAccount = (userId: string) => {
    setLoading(true);
    setConversations([]);
    setMessages([]);
    setSelectedConversationId(null);
    setPendingFiles([]);
    setAttachmentStatus('');
    setError('');
    switchAccount(userId);
  };

  useEffect(() => {
    conversations.forEach((conversation) => {
      joinConversation(conversation.id).catch(() => undefined);
    });

    return () => {
      conversations.forEach((conversation) => {
        leaveConversation(conversation.id).catch(() => undefined);
      });
    };
  }, [conversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setScheduledMessages([]);
      setTasks([]);
      return;
    }

    setActiveTab('chat');
    joinConversation(selectedConversationId).catch(() => undefined);

    const loadMessages = () => conversationAPI.getMessages(selectedConversationId)
      .then((response) => {
        setMessages(mergeServerAndQueuedMessages(response.data, queuedMessagesRef.current, selectedConversationId));
        clearConversationUnread(selectedConversationId);
      })
      .catch(() => setError('Unable to load messages'));
    const loadScheduledMessages = () => conversationAPI.getScheduledMessages(selectedConversationId)
      .then((response) => setScheduledMessages(response.data))
      .catch(() => undefined);
    const loadTasks = () => conversationAPI.getTasks(selectedConversationId)
      .then((response) => setTasks(response.data))
      .catch(() => undefined);

    loadMessages();
    loadScheduledMessages();
    loadTasks();
    setPendingFiles([]);
    setAttachmentStatus('');
    setIsDraggingAttachment(false);
    setEditingMessageId(null);
    setEditDraft('');
    setEditSaving(false);
    setReactionPickerMessageId(null);
    setMessageMenuId(null);
    setReplyingToMessage(null);
    setMessageActionStatus('');
    setTranslationMessageId(null);
    setHeaderMenuOpen(false);
    setScheduleOpen(false);
    setTaskSourceMessage(null);
    setTaskDraft('');
    setTaskDescriptionDraft('');
    setTaskPriorityDraft('Normal');
    setTaskAssigneeDraft('');
    setTaskDueDraft('');
    setTaskQuery('');
    setShareMessage(null);
    setDocumentPreview(null);
    setImportantDraft(false);
    setScheduleFor(toDateTimeLocalValue(new Date(Date.now() + 15 * 60000)));

    const poll = window.setInterval(() => {
      loadMessages();
      loadScheduledMessages();
      loadTasks();
    }, 15000);

    return () => {
      window.clearInterval(poll);
      leaveConversation(selectedConversationId).catch(() => undefined);
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    setMessages((items) => {
      const serverMessages = items.filter((message) => !message.deliveryStatus || message.deliveryStatus === 'sent');
      return mergeServerAndQueuedMessages(serverMessages, queuedMessages, selectedConversationId);
    });
  }, [queuedMessages, selectedConversationId]);

  useEffect(() => {
    const query = quickGroupOpen ? quickGroupQuery : userQuery;
    const timer = window.setTimeout(() => {
      userAPI.searchUsers(query)
        .then((response) => setUsers(response.data))
        .catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [quickGroupOpen, quickGroupQuery, userQuery]);

  useEffect(() => {
    if (!quickGroupOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      quickGroupInputRef.current?.focus();
    });
  }, [quickGroupOpen]);

  const createConversation = async () => {
    if (!user || recipientCount === 0) {
      return;
    }

    setRequestStatus('Sending request...');
    const selectedUsers = users.filter((item) => selectedUserIds.includes(item.id));
    const members = [
      {
        userId: user.id,
        userEmail: user.email,
        userName: displayName,
      },
      ...selectedUsers.map((item) => ({
        userId: item.id,
        userEmail: item.email,
        userName: displayUser(item),
      })),
    ];

    try {
      const response = await conversationAPI.createConversation({
        type: mode === 'group' ? 'Group' : 'Direct',
        title: mode === 'group' ? groupTitle || 'Group chat' : null,
        members,
        inviteEmails,
      });
      setConversations((items) => {
        const exists = items.some((conversation) => conversation.id === response.data.id);
        return exists ? items : [{ ...response.data, unreadCount: response.data.unreadCount || 0 }, ...items];
      });
      setSelectedConversationId(response.data.id);
      setSelectedUserIds([]);
      setInviteEmails([]);
      setGroupTitle('');
      setUserQuery('');
      setError('');
      setNewChatOpen(false);
      setRequestStatus('Request sent. Chat is ready.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create chat');
      setRequestStatus('');
    }
  };

  const resetQuickGroupComposer = () => {
    setQuickGroupOpen(false);
    setQuickGroupQuery('');
    setQuickGroupSelectedUsers([]);
    setQuickGroupStatus('');
    setCreatingQuickGroup(false);
  };

  const selectQuickGroupUser = (selectedUser: UserSummary) => {
    setQuickGroupSelectedUsers((items) => (
      items.some((item) => item.id === selectedUser.id) ? items : [...items, selectedUser]
    ));
    setQuickGroupQuery('');
    setQuickGroupStatus('');
  };

  const createQuickGroupConversation = async () => {
    if (!user || !quickGroupCanCreate || creatingQuickGroup) {
      return;
    }

    const inviteEmailsToSend = quickGroupCanInviteEmail ? [quickGroupEmail] : [];
    const titleParts = [
      ...quickGroupSelectedUsers.map(displayUser),
      ...inviteEmailsToSend,
    ];
    const groupName = titleParts.length > 0 ? titleParts.slice(0, 3).join(', ') : 'Group chat';

    setCreatingQuickGroup(true);
    setQuickGroupStatus('');

    try {
      const response = await conversationAPI.createConversation({
        type: 'Group',
        title: groupName,
        members: [
          {
            userId: user.id,
            userEmail: user.email,
            userName: displayName,
          },
          ...quickGroupSelectedUsers.map((item) => ({
            userId: item.id,
            userEmail: item.email,
            userName: displayUser(item),
          })),
        ],
        inviteEmails: inviteEmailsToSend,
      });

      setConversations((items) => {
        const exists = items.some((conversation) => conversation.id === response.data.id);
        return exists ? items : [{ ...response.data, unreadCount: response.data.unreadCount || 0 }, ...items];
      });
      setSelectedConversationId(response.data.id);
      setSearchParams({ conversationId: response.data.id });
      resetQuickGroupComposer();
    } catch (err: any) {
      setQuickGroupStatus(err.response?.data || 'Unable to create group chat');
      setCreatingQuickGroup(false);
    }
  };

  const appendSentMessage = (message: ConversationMessage) => {
    const sentMessage: ConversationMessage = { ...message, deliveryStatus: 'sent' };
    if (sentMessage.clientMessageId) {
      setQueuedMessages((items) => items.filter((item) => item.clientMessageId !== sentMessage.clientMessageId));
    }

    setMessages((items) => (
      items.some((item) => item.id === sentMessage.id)
        ? items.map((item) => (item.id === sentMessage.id ? sentMessage : item))
        : [
            ...items.filter((item) => !sentMessage.clientMessageId || item.clientMessageId !== sentMessage.clientMessageId),
            sentMessage,
          ]
    ));
    setConversations((items) => sortConversationsByActivity(items.map((conversation) => (
      conversation.id === sentMessage.conversationId
        ? { ...conversation, lastMessage: sentMessage, updatedAt: sentMessage.sentAt }
        : conversation
    ))));
  };

  const updateMessageReactions = (messageId: string, reactions: ConversationMessageReaction[]) => {
    setMessages((items) => items.map((item) => (
      item.id === messageId ? { ...item, reactions } : item
    )));
    setConversations((items) => items.map((conversation) => {
      const lastMessage = conversation.lastMessage;
      if (!lastMessage || lastMessage.id !== messageId) {
        return conversation;
      }

      return {
        ...conversation,
        lastMessage: { ...lastMessage, reactions },
      };
    }));
  };

  const notifyConversationMessage = useCallback(async (_message: ConversationMessage, _sourceConversation = selectedConversation) => {
    await Promise.resolve();
  }, [selectedConversation]);

  const notifyConversationMessageEdited = async (_message: ConversationMessage) => {
    await Promise.resolve();
  };

  const notifyConversationReactionUpdated = async (_messageId: string, _reactions: ConversationMessageReaction[]) => {
    await Promise.resolve();
  };

  const appendQueuedMessage = (queuedMessage: QueuedChatMessage) => {
    const pendingMessage = queuedMessageToConversationMessage(queuedMessage);
    setMessages((items) => (
      items.some((item) => item.clientMessageId === queuedMessage.clientMessageId)
        ? items
        : [...items, pendingMessage]
    ));
    setConversations((items) => sortConversationsByActivity(items.map((conversation) => (
      conversation.id === queuedMessage.conversationId
        ? { ...conversation, lastMessage: pendingMessage, updatedAt: pendingMessage.sentAt }
        : conversation
    ))));
  };

  const queueTextMessage = (
    conversation: Conversation,
    text: string,
    replyTarget: ConversationMessage | null,
    lastError?: string,
    clientMessageId = createClientMessageId(),
    isImportant = false,
  ) => {
    if (!user) {
      return null;
    }

    const now = new Date().toISOString();
    const queuedMessage: QueuedChatMessage = {
      clientMessageId,
      conversationId: conversation.id,
      senderId: user.id,
      senderName: displayName,
      message: text,
      isImportant,
      replyToMessageId: replyTarget?.id,
      replyToSenderName: replyTarget?.senderName,
      replyToPreview: replyTarget ? getMessagePreview(replyTarget) : undefined,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
      status: 'pending',
      lastError,
    };

    setQueuedMessages((items) => [...items, queuedMessage]);
    appendQueuedMessage(queuedMessage);
    return queuedMessage;
  };

  const retryQueuedMessages = useCallback(async () => {
    if (!user || retryingOutboxRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return;
    }

    const now = Date.now();
    const dueMessages = queuedMessagesRef.current.filter((item) => (
      item.status !== 'retrying' &&
      (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now)
    ));

    if (dueMessages.length === 0) {
      return;
    }

    retryingOutboxRef.current = true;
    const dueIds = new Set(dueMessages.map((item) => item.clientMessageId));
    setQueuedMessages((items) => items.map((item) => (
      dueIds.has(item.clientMessageId) ? { ...item, status: 'retrying' } : item
    )));

    try {
      for (const queuedMessage of dueMessages) {
        try {
          const response = await conversationAPI.sendMessage(queuedMessage.conversationId, {
            senderId: queuedMessage.senderId,
            senderName: queuedMessage.senderName,
            clientMessageId: queuedMessage.clientMessageId,
            message: queuedMessage.message,
            isImportant: queuedMessage.isImportant,
            replyToMessageId: queuedMessage.replyToMessageId,
          });
          const sentMessage = response.data as ConversationMessage;
          appendSentMessage(sentMessage);
          const sourceConversation = conversationsRef.current.find((conversation) => conversation.id === queuedMessage.conversationId);
          await notifyConversationMessage(sentMessage, sourceConversation);
          setMessageActionStatus('Queued message sent.');
        } catch (err: any) {
          const attempts = queuedMessage.attempts + 1;
          const retryAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
          const retryable = isRetryableSendError(err);
          setQueuedMessages((items) => items.map((item) => (
            item.clientMessageId === queuedMessage.clientMessageId
              ? {
                  ...item,
                  attempts,
                  status: 'failed',
                  nextAttemptAt: retryable ? retryAt : undefined,
                  lastError: getSendErrorText(err),
                }
              : item
          )));

          if (!retryable) {
            setError(getSendErrorText(err));
          }
        }
      }
    } finally {
      retryingOutboxRef.current = false;
    }
  }, [displayName, notifyConversationMessage, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    retryQueuedMessages();
    const retryTimer = window.setInterval(() => {
      retryQueuedMessages();
    }, 10000);
    window.addEventListener('online', retryQueuedMessages);

    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener('online', retryQueuedMessages);
    };
  }, [retryQueuedMessages, user]);

  const startEditingMessage = (message: ConversationMessage) => {
    setEditingMessageId(message.id);
    setEditDraft(message.message);
    setEditImportant(Boolean(message.isImportant));
    setReactionPickerMessageId(null);
    setMessageMenuId(null);
    setReplyingToMessage(null);
    setError('');
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditDraft('');
    setEditImportant(false);
  };

  const applyEditedMessage = (message: ConversationMessage) => {
    setMessages((items) => items.map((item) => (
      item.id === message.id ? { ...item, ...message } : item
    )));
    setConversations((items) => items.map((conversation) => (
      conversation.lastMessage?.id === message.id
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, ...message }, updatedAt: message.editedAt || conversation.updatedAt }
        : conversation
    )));
  };

  const startReplyMessage = (message: ConversationMessage) => {
    setReplyingToMessage(message);
    setMessageMenuId(null);
    setReactionPickerMessageId(null);
    setMessageActionStatus('');
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const forwardMessage = (message: ConversationMessage) => {
    const preview = getMessagePreview(message);
    setMessageDraft((current) => {
      const forwarded = `Forwarded from ${message.senderName}:\n${preview}`;
      return current.trim() ? `${current}\n\n${forwarded}` : forwarded;
    });
    setMessageMenuId(null);
    setReactionPickerMessageId(null);
    setMessageActionStatus('');
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const copyMessageLink = async (message: ConversationMessage) => {
    const link = `${window.location.origin}/chat?conversationId=${message.conversationId}&messageId=${message.id}`;
    setMessageMenuId(null);
    try {
      await navigator.clipboard.writeText(link);
      setMessageActionStatus('Message link copied.');
    } catch {
      setMessageActionStatus(link);
    }
  };

  const deleteConversationMessage = async (message: ConversationMessage) => {
    if (!selectedConversation || message.senderId !== user?.id) {
      return;
    }

    setMessageMenuId(null);
    try {
      await conversationAPI.deleteMessage(selectedConversation.id, message.id);
      setMessages((items) => items.filter((item) => item.id !== message.id));
      setConversations((items) => items.map((conversation) => {
        if (conversation.id !== selectedConversation.id || conversation.lastMessage?.id !== message.id) {
          return conversation;
        }

        return { ...conversation, lastMessage: undefined };
      }));
      setMessageActionStatus('Message deleted.');
      refreshConversations().catch(() => undefined);
    } catch (err: any) {
      setError(err.response?.data || 'Unable to delete message');
    }
  };

  const togglePinMessage = async (message: ConversationMessage) => {
    if (!selectedConversation) {
      return;
    }

    setMessageMenuId(null);
    try {
      const response = await conversationAPI.togglePin(selectedConversation.id, message.id);
      const updatedMessage = response.data as ConversationMessage;
      applyEditedMessage(updatedMessage);
      setMessageActionStatus(updatedMessage.isPinned ? 'Message pinned for everyone.' : 'Message unpinned.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to update pinned message');
    }
  };

  const markMessageUnread = async (message: ConversationMessage) => {
    if (!selectedConversation) {
      return;
    }

    setMessageMenuId(null);
    try {
      await conversationAPI.markMessageUnread(selectedConversation.id, message.id);
      setConversations((items) => items.map((conversation) => (
        conversation.id === selectedConversation.id
          ? { ...conversation, unreadCount: Math.max(1, conversation.unreadCount || 0) }
          : conversation
      )));
      setMessageActionStatus('Marked as unread.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to mark message unread');
    }
  };

  const showTranslationPanel = (message: ConversationMessage) => {
    setTranslationMessageId((current) => (current === message.id ? null : message.id));
    setMessageMenuId(null);
    setMessageActionStatus('');
  };

  const saveEditedMessage = async (message: ConversationMessage) => {
    if (!user || !selectedConversation || editSaving) {
      return;
    }

    const nextMessage = editDraft.replace(/\s+$/, '');
    if (!nextMessage.trim()) {
      setError('Message is required');
      return;
    }

    if (nextMessage === message.message && editImportant === Boolean(message.isImportant)) {
      cancelEditingMessage();
      return;
    }

    setEditSaving(true);
    try {
      const response = await conversationAPI.updateMessage(selectedConversation.id, message.id, {
        message: nextMessage,
        isImportant: editImportant,
      });
      const updatedMessage = response.data as ConversationMessage;
      applyEditedMessage(updatedMessage);
      cancelEditingMessage();
      setError('');
      await notifyConversationMessageEdited(updatedMessage);
    } catch (err: any) {
      setError(err.response?.data || 'Unable to edit message');
    } finally {
      setEditSaving(false);
    }
  };

  const editLastOwnMessage = () => {
    if (messageDraft.trim() || editingMessageId) {
      return false;
    }

    const lastOwnMessage = [...messages].reverse().find((message) => message.senderId === user?.id && !!message.message);
    if (lastOwnMessage) {
      startEditingMessage(lastOwnMessage);
      return true;
    }

    return false;
  };

  const toggleReaction = async (message: ConversationMessage, emoji: string) => {
    if (!user || !selectedConversation || reactingMessageId) {
      return;
    }

    setReactingMessageId(message.id);
    try {
      const response = await conversationAPI.toggleReaction(selectedConversation.id, message.id, { emoji });
      const reactions = (response.data || []).map(normalizeReaction);
      updateMessageReactions(message.id, reactions);
      setReactionPickerMessageId(null);
      await notifyConversationReactionUpdated(message.id, reactions);
    } catch (err: any) {
      setError(err.response?.data || 'Unable to update reaction');
    } finally {
      setReactingMessageId(null);
    }
  };

  const scheduleMessage = async () => {
    if (!selectedConversation || scheduling) {
      return;
    }

    const text = messageDraft.replace(/\s+$/, '');
    if (!text.trim()) {
      setError('Type a message before scheduling it');
      return;
    }

    const scheduledDate = new Date(scheduleFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      setError('Choose a valid schedule time');
      return;
    }

    setScheduling(true);
    try {
      const response = await conversationAPI.scheduleMessage(selectedConversation.id, {
        message: text,
        scheduledFor: scheduledDate.toISOString(),
      });
      setScheduledMessages((items) => [...items, response.data].sort((left, right) => (
        new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime()
      )));
      setMessageDraft('');
      setScheduleOpen(false);
      setScheduleFor(toDateTimeLocalValue(new Date(Date.now() + 15 * 60000)));
      setError('');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to schedule message');
    } finally {
      setScheduling(false);
    }
  };

  const cancelScheduledMessage = async (scheduledMessageId: string) => {
    if (!selectedConversation) {
      return;
    }

    try {
      await conversationAPI.cancelScheduledMessage(selectedConversation.id, scheduledMessageId);
      setScheduledMessages((items) => items.filter((item) => item.id !== scheduledMessageId));
    } catch (err: any) {
      setError(err.response?.data || 'Unable to cancel scheduled message');
    }
  };

  const refreshTasks = async () => {
    if (!selectedConversation) {
      return;
    }

    const response = await conversationAPI.getTasks(selectedConversation.id);
    setTasks(response.data);
  };

  const startTaskFromMessage = (message: ConversationMessage) => {
    setTaskSourceMessage(message);
    setTaskDraft(getMessagePreview(message));
    setTaskDescriptionDraft(message.message || message.attachmentFileName || '');
    setTaskPriorityDraft(message.isImportant ? 'High' : 'Normal');
    setTaskAssigneeDraft(user?.id || '');
    setTaskDueDraft('');
    setActiveTab('tasks');
    setMessageMenuId(null);
    setReactionPickerMessageId(null);
  };

  const createTask = async () => {
    if (!selectedConversation || creatingTask) {
      return;
    }

    const title = taskDraft.trim();
    if (!title) {
      setError('Task title is required');
      return;
    }

    const assignee = selectedConversation.members.find((member) => member.userId === taskAssigneeDraft);
    setCreatingTask(true);
    try {
      const response = await conversationAPI.createTask(selectedConversation.id, {
        sourceMessageId: taskSourceMessage?.id,
        title,
        description: taskDescriptionDraft.trim(),
        priority: taskPriorityDraft,
        assigneeId: assignee?.userId,
        assigneeEmail: assignee?.userEmail,
        assigneeName: assignee?.userName,
        dueDate: taskDueDraft ? new Date(taskDueDraft).toISOString() : undefined,
      });
      setTasks((items) => [response.data, ...items]);
      setTaskDraft('');
      setTaskDescriptionDraft('');
      setTaskPriorityDraft('Normal');
      setTaskAssigneeDraft('');
      setTaskDueDraft('');
      setTaskSourceMessage(null);
      setMessageActionStatus('Task created.');
      setError('');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const updateTask = async (task: ConversationTask, changes: Partial<ConversationTask>) => {
    if (!selectedConversation) {
      return;
    }

    try {
      const response = await conversationAPI.updateTask(selectedConversation.id, task.id, changes);
      setTasks((items) => items.map((item) => (item.id === task.id ? response.data : item)));
      setMessageActionStatus('Task updated.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to update task');
    }
  };

  const addTaskNote = async (task: ConversationTask) => {
    if (!selectedConversation) {
      return;
    }

    const note = (taskNoteDrafts[task.id] || '').trim();
    if (!note) {
      return;
    }

    try {
      await conversationAPI.addTaskNote(selectedConversation.id, task.id, { note });
      setTaskNoteDrafts((items) => ({ ...items, [task.id]: '' }));
      await refreshTasks();
    } catch (err: any) {
      setError(err.response?.data || 'Unable to add note');
    }
  };

  const deleteTask = async (task: ConversationTask) => {
    if (!selectedConversation) {
      return;
    }

    try {
      await conversationAPI.deleteTask(selectedConversation.id, task.id);
      setTasks((items) => items.filter((item) => item.id !== task.id));
      setMessageActionStatus('Task deleted.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to delete task');
    }
  };

  const openTaskSourceMessage = (task: ConversationTask) => {
    if (!task.sourceMessageId) {
      return;
    }

    setActiveTab('chat');
    setHighlightMessageId(task.sourceMessageId);
    setSearchParams({ conversationId: task.conversationId, messageId: task.sourceMessageId });
  };

  const shareDocumentByEmail = async () => {
    if (!selectedConversation || !shareMessage || sharingDocument) {
      return;
    }

    const emails = shareEmailsDraft
      .split(/[;,\n]/)
      .map((email) => email.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      setError('Add at least one email recipient');
      return;
    }

    setSharingDocument(true);
    try {
      await conversationAPI.shareDocument(selectedConversation.id, shareMessage.id, {
        emails,
        message: shareNoteDraft,
      });
      setShareMessage(null);
      setShareEmailsDraft('');
      setShareNoteDraft('');
      setMessageActionStatus('Document shared by email.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to share document');
    } finally {
      setSharingDocument(false);
    }
  };

  const runGlobalSearch = async (query: string) => {
    setChatSearch(query);
    if (query.trim().length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    setSearchingGlobally(true);
    try {
      const response = await conversationAPI.search(query.trim());
      setGlobalSearchResults(response.data);
    } catch {
      setGlobalSearchResults([]);
    } finally {
      setSearchingGlobally(false);
    }
  };

  const startInstantCall = async (mode: 'audio' | 'video') => {
    if (!user || !selectedConversation || startingCall) {
      setError('Select a chat before starting a call');
      return;
    }

    const callRecipients = selectedConversation.members
      .filter((member) => member.userId !== user.id);

    const attendeeEmails = Array.from(new Set([
      ...selectedConversation.members
        .filter((member) => member.userId !== user.id)
        .map((member) => member.userEmail)
        .filter(Boolean),
      ...(selectedConversation.invites || [])
        .filter((invite) => !invite.hasAccepted)
        .map((invite) => invite.email)
        .filter(Boolean),
    ])).filter((email) => email.toLowerCase() !== user.email.toLowerCase());

    if (attendeeEmails.length === 0) {
      setError('Add someone to this chat before starting a call');
      return;
    }

    const startedAt = new Date();
    const durationMinutes = 60;
    const callLabel = mode === 'video' ? 'video call' : 'call';
    setStartingCall(mode);
    setError('');

    try {
      const response = await meetingAPI.createMeeting({
        title: `${selectedTitle} ${mode === 'video' ? 'video call' : 'call'}`,
        description: `${displayName} started an instant ${callLabel} from chat.`,
        startTime: startedAt.toISOString(),
        endTime: new Date(startedAt.getTime() + durationMinutes * 60000).toISOString(),
        durationMinutes,
        attendeeEmails,
        location: '',
        isOnlineMeeting: true,
        lobbyEnabled: false,
        allowChat: true,
        allowReactions: true,
        allowScreenShare: true,
        allowAttendeeUnmute: true,
        allowRecording: false,
        allowTranscription: false,
        recurrenceRule: '',
        maxParticipants: Math.max(2, attendeeEmails.length + 1),
        isRecorded: false,
      });

      const meetingId = response.data.id;
      const callUrl = getMeetingJoinUrl(meetingId, response.data.meetingLink, `call=${mode}&autojoin=1`);
      const callMessage = `${displayName} started a ${callLabel}: ${callUrl}`;
      const messageResponse = await conversationAPI.sendMessage(selectedConversation.id, {
        senderId: user.id,
        senderName: displayName,
        message: callMessage,
      });
      appendSentMessage(messageResponse.data);
      await notifyConversationMessage(messageResponse.data);
      for (const recipient of callRecipients) {
        let callLogId = '';
        try {
          const callLogResponse = await meetingAPI.createCallLog(meetingId, {
            conversationId: selectedConversation.id,
            recipientUserId: recipient.userId,
            recipientEmail: recipient.userEmail,
            recipientName: recipient.userName,
            callType: mode,
            joinUrl: callUrl,
          });
          callLogId = callLogResponse.data.id;
          window.setTimeout(() => {
            meetingAPI.updateCallLog(meetingId, callLogId, {
              status: 'NoResponse',
              reason: 'No response',
            })
              .then((updatedCall) => {
                setCallHistory((items) => items.map((item) => (
                  item.id === callLogId ? { ...item, ...updatedCall.data } : item
                )));
              })
              .catch(() => undefined);
          }, 45_000);
        } catch (callError: any) {
          if (callLogId) {
            const callErrorText = callError?.response?.data?.message
              || (typeof callError?.response?.data === 'string' ? callError.response.data : '')
              || callError?.message
              || 'Unable to ring user';
            await meetingAPI.updateCallLog(meetingId, callLogId, {
              status: 'Failed',
              reason: callErrorText,
            }).catch(() => undefined);
          }
        }
      }
      loadConversationCallHistory().catch(() => undefined);
      openMeetingJoinInNewTab(meetingId, response.data.meetingLink, `call=${mode}&autojoin=1`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || `Unable to start ${callLabel}`);
    } finally {
      setStartingCall(null);
    }
  };

  const markCallSeen = async (call: MeetingCallLog) => {
    setCallHistory((items) => items.map((item) => (
      item.id === call.id ? { ...item, isSeen: true } : item
    )));
    await meetingAPI.markCallSeen(call.id).catch(() => undefined);
  };

  const clearCallFromChat = async (call: MeetingCallLog) => {
    setCallHistory((items) => items.filter((item) => item.id !== call.id));
    await meetingAPI.hideCallLog(call.id).catch(() => {
      setCallHistory((items) => [call, ...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setCallHistoryError('Unable to clear call');
    });
  };

  const callBackFromHistory = async (call: MeetingCallLog) => {
    await markCallSeen(call);
    openUrlInNewTab(call.joinUrl || getMeetingJoinUrl(call.meetingId, undefined, `call=${call.callType || 'video'}&autojoin=1`));
  };

  const addPendingFiles = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    if (incomingFiles.length === 0) {
      return;
    }

    const validFiles = incomingFiles.filter((file) => file.size <= 50 * 1024 * 1024);
    const skipped = incomingFiles.length - validFiles.length;
    setPendingFiles((items) => {
      const existing = new Set(items.map(fileKey));
      const next = [...items];
      validFiles.forEach((file) => {
        if (!existing.has(fileKey(file))) {
          next.push(file);
        }
      });
      return next;
    });
    setAttachmentStatus(skipped > 0 ? `${skipped} file${skipped === 1 ? '' : 's'} skipped. Limit is 50 MB each.` : '');
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setAttachmentStatus('');
  };

  const sendMessage = async () => {
    if (!user || !selectedConversation || sending) {
      return;
    }

    const shouldRestoreFocus = document.activeElement === messageInputRef.current;
    const text = messageDraft.replace(/\s+$/, '');
    const filesToSend = pendingFiles;
    const replyTarget = replyingToMessage;
    const messageIsImportant = importantDraft;
    if (!text.trim() && filesToSend.length === 0) {
      return;
    }

    setMessageDraft('');
    setPendingFiles([]);
    setAttachmentStatus('');
    setReplyingToMessage(null);
    setImportantDraft(false);
    setSending(true);
    const clientMessageId = filesToSend.length === 0 ? createClientMessageId() : undefined;

    try {
      if (filesToSend.length === 0) {
        const response = await conversationAPI.sendMessage(selectedConversation.id, {
          senderId: user.id,
          senderName: displayName,
          clientMessageId,
          message: text,
          isImportant: messageIsImportant,
          replyToMessageId: replyTarget?.id,
        });
        appendSentMessage(response.data);
        await notifyConversationMessage(response.data);
        return;
      }

      for (const [index, file] of filesToSend.entries()) {
        const formData = new FormData();
        formData.append('senderId', user.id);
        formData.append('senderName', displayName);
        formData.append('message', index === 0 ? text : '');
        if (index === 0 && messageIsImportant) {
          formData.append('isImportant', 'true');
        }
        formData.append('file', file);
        if (replyTarget?.id && index === 0) {
          formData.append('replyToMessageId', replyTarget.id);
        }

        const response = await conversationAPI.uploadAttachment(selectedConversation.id, formData);
        appendSentMessage(response.data);
        await notifyConversationMessage(response.data);
      }
    } catch (err: any) {
      if (filesToSend.length === 0 && text.trim() && selectedConversation && isRetryableSendError(err)) {
        queueTextMessage(selectedConversation, text, replyTarget, getSendErrorText(err), clientMessageId, messageIsImportant);
        setMessageActionStatus('Message saved to outbox. It will send automatically when Samvaad reconnects.');
        setError('');
        return;
      }

      setError(err.response?.data || 'Unable to send message or attachment');
      setMessageDraft(text);
      setPendingFiles(filesToSend);
      setReplyingToMessage(replyTarget);
      setImportantDraft(messageIsImportant);
    } finally {
      setSending(false);
      if (shouldRestoreFocus) {
        window.requestAnimationFrame(() => {
          messageInputRef.current?.focus();
        });
      }
    }
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!selectedConversation) {
      return;
    }

    event.preventDefault();
    setIsDraggingAttachment(true);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!selectedConversation) {
      return;
    }

    event.preventDefault();
    setIsDraggingAttachment(false);
    addPendingFiles(event.dataTransfer.files);
  };

  const handleMessagePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (!selectedConversation) {
      return;
    }

    const files = Array.from(event.clipboardData.files || []);
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addPendingFiles(imageFiles);
    setAttachmentStatus(`${imageFiles.length} screenshot${imageFiles.length === 1 ? '' : 's'} ready to send.`);
  };

  const downloadAttachment = async (message: ConversationMessage) => {
    if (!message.attachmentUrl) {
      return;
    }

    try {
      const response = await conversationAPI.downloadAttachment(message.attachmentUrl);
      const blob = new Blob([response.data], {
        type: message.attachmentContentType || response.data.type || 'application/octet-stream',
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = message.attachmentFileName || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      setAttachmentStatus('Unable to download attachment');
    }
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((items) => {
      if (mode === 'direct') {
        setInviteEmails([]);
        return items.includes(id) ? [] : [id];
      }

      return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
    });
  };

  const addEmailInvite = () => {
    if (!canAddEmailInvite) {
      return;
    }

    setInviteEmails((items) => {
      if (mode === 'direct') {
        setSelectedUserIds([]);
        return [userQuery.trim()];
      }

      return [...items, userQuery.trim()];
    });
    setUserQuery('');
    setRequestStatus('');
  };

  const renderConversationButton = (conversation: Conversation) => {
    const otherMember = getOtherMember(conversation);
    const title = getConversationTitle(conversation);
    const active = selectedConversationId === conversation.id;
    const preview = describeLastMessage(conversation.lastMessage, conversation.members.length);
    const unreadCount = conversation.unreadCount || 0;
    const hasUnread = unreadCount > 0 && !active;

    return (
      <button
        key={conversation.id}
        onClick={() => {
          setSelectedConversationId(conversation.id);
          setSearchParams({ conversationId: conversation.id });
          setHeaderMenuOpen(false);
          setMessageMenuId(null);
        }}
        className={`group mx-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-md px-3 py-3 text-left transition ${
          active
            ? 'bg-white shadow-md ring-1 ring-slate-200'
            : hasUnread
              ? 'bg-white shadow-md ring-1 ring-teal-200'
              : 'hover:bg-white/70'
        }`}
      >
        <UserAvatar
          displayName={title}
          email={otherMember?.userEmail}
          profilePictureUrl={conversation.type === 'Direct' ? getUserAvatar(otherMember?.userId) : undefined}
          status={conversation.type === 'Direct' ? getUserStatus(otherMember?.userId) : undefined}
          showStatus={conversation.type === 'Direct'}
          size="lg"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${hasUnread ? 'font-bold text-slate-950' : 'font-semibold text-slate-800'}`}>{title}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`text-xs ${hasUnread ? 'font-semibold text-teal-700' : 'text-slate-500'}`}>
                {formatConversationDate(conversation.lastMessage?.sentAt || conversation.updatedAt || conversation.createdAt)}
              </span>
              {hasUnread && (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm"
                  aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
                >
                  {formatUnreadCount(unreadCount)}
                </span>
              )}
            </span>
          </span>
          <span className={`mt-1 block truncate text-sm ${hasUnread ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
            {conversation.lastMessage?.senderId === user?.id ? 'You: ' : ''}{preview}
          </span>
        </span>
      </button>
    );
  };

  return (
    <AppShell
      active="chat"
      title="Talk"
      subtitle="Samvaad"
      actions={(
        <ProfileStatusMenu
          displayName={displayName}
          currentUserId={user?.id}
          email={user?.email}
          profilePictureUrl={user?.profilePictureUrl}
          status={user?.status}
          accounts={accounts.map((account) => account.user)}
          avatarUploading={avatarUploading}
          onChange={handleStatusChange}
          onSwitchAccount={handleSwitchAccount}
          onAddAccount={() => navigate('/login?addAccount=1')}
          onAvatarChange={handleAvatarChange}
          onAvatarRemove={handleAvatarRemove}
          onSignOut={handleSignOut}
        />
      )}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-3 overflow-hidden bg-transparent p-3">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">Conversations</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  onClick={() => setChatSearch('')}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
                  onClick={() => setNewChatOpen(true)}
                >
                  New
                </button>
              </div>
            </div>
            <input
              value={chatSearch}
              onChange={(event) => runGlobalSearch(event.target.value)}
              placeholder="Search chats, tasks, files, meetings"
              className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            {chatSearch.trim().length >= 2 && (
              <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                {searchingGlobally ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Searching Samvaad...</p>
                ) : globalSearchResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">No matching chats, tasks, documents, or meetings.</p>
                ) : globalSearchResults.slice(0, 8).map((result) => (
                  <button
                    key={`${result.kind}-${result.id}`}
                    type="button"
                    onClick={() => {
                      if (result.conversationId) {
                        setSelectedConversationId(result.conversationId);
                        setSearchParams(result.kind === 'Task'
                          ? { conversationId: result.conversationId }
                          : { conversationId: result.conversationId, messageId: result.id });
                        setActiveTab(result.kind === 'Task' ? 'tasks' : 'chat');
                      } else if (result.meetingId) {
                        openMeetingJoinInNewTab(result.meetingId);
                      }
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                      <span>{result.kind}</span>
                      <span>{formatScheduledDate(result.occurredAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium text-slate-900">{result.title}</span>
                    {result.snippet && <span className="mt-0.5 block truncate text-xs text-slate-500">{result.snippet}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <button type="button" onClick={() => setChatSearch('unread')} className="rounded-md border border-slate-200 px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-50">
                Unread
              </button>
              <button type="button" onClick={() => setActiveTab('tasks')} disabled={!selectedConversation} className="rounded-md border border-slate-200 px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Tasks
              </button>
              <button type="button" onClick={() => setMessageActionStatus(`${pinnedMessages.length} pinned message${pinnedMessages.length === 1 ? '' : 's'} in this chat.`)} disabled={!selectedConversation} className="rounded-md border border-slate-200 px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Pinned
              </button>
              <button type="button" onClick={() => setMessageActionStatus(`${importantMessages.length} important message${importantMessages.length === 1 ? '' : 's'} in this chat.`)} disabled={!selectedConversation} className="rounded-md border border-slate-200 px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Important
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="mt-4 flex w-full items-center gap-3 rounded-md bg-amber-50 px-3 py-3 text-left hover:bg-amber-100"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-amber-200 text-sm font-semibold text-amber-800">Req</span>
              <span className="font-semibold text-slate-700">{pendingRequestCount || 0} requests</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {loading ? (
              <p className="px-4 py-3 text-sm text-slate-500">Loading chats...</p>
            ) : filteredConversations.length === 0 ? (
              <div className="mx-3 rounded-md bg-slate-50 px-4 py-5 text-sm text-slate-500">
                No chats found.
              </div>
            ) : (
              <>
                {pinnedConversations.length > 0 && (
                  <div className="mb-3">
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pinned</p>
                    {pinnedConversations.map(renderConversationButton)}
                  </div>
                )}
                {recentConversations.length > 0 && (
                  <div>
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</p>
                    {recentConversations.map(renderConversationButton)}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Start a chat
            </button>
          </div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {selectedConversation && (
                <UserAvatar
                  displayName={selectedTitle}
                  email={getOtherMember(selectedConversation)?.userEmail}
                  profilePictureUrl={selectedConversation.type === 'Direct' ? getUserAvatar(getOtherMember(selectedConversation)?.userId) : undefined}
                  status={selectedConversation.type === 'Direct' ? getUserStatus(getOtherMember(selectedConversation)?.userId) : undefined}
                  showStatus={selectedConversation.type === 'Direct'}
                  size="md"
                />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-slate-900">{selectedTitle}</h2>
                {selectedConversation && (
                  <div className="mt-1 flex gap-4 text-sm">
                    {([
                      ['chat', 'Chat'],
                      ['files', `Files${selectedFiles.length ? ` (${selectedFiles.length})` : ''}`],
                      ['photos', `Photos${selectedPhotos.length ? ` (${selectedPhotos.length})` : ''}`],
                      ['tasks', `Tasks${tasks.length ? ` (${tasks.length})` : ''}`],
                      ['calls', `Calls${callHistory.length ? ` (${callHistory.length})` : ''}${unseenCallCount ? ` - ${unseenCallCount}` : ''}`],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`rounded-md px-3 py-1.5 ${
                          activeTab === tab ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => startInstantCall('video')}
                disabled={!selectedConversation || !!startingCall}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-teal-700 hover:bg-teal-50 disabled:text-slate-400 disabled:hover:bg-transparent"
                title="Start video call"
                aria-label="Start video call"
              >
                <VideoCallIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => startInstantCall('audio')}
                disabled={!selectedConversation || !!startingCall}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-teal-700 hover:bg-teal-50 disabled:text-slate-400 disabled:hover:bg-transparent"
                title="Start audio call"
                aria-label="Start audio call"
              >
                <PhoneCallIcon className="h-5 w-5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setQuickGroupOpen((open) => !open);
                    setHeaderMenuOpen(false);
                    setQuickGroupStatus('');
                  }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-teal-700 hover:bg-teal-50 ${quickGroupOpen ? 'bg-teal-50' : ''}`}
                  title="Start a group chat"
                  aria-label="Start a group chat"
                  aria-expanded={quickGroupOpen}
                >
                  <PeoplePlusIcon className="h-5 w-5" />
                </button>

                {quickGroupOpen && (
                  <div className="absolute right-0 top-12 z-40 w-[min(540px,calc(100vw-2rem))] rounded-md border border-slate-200 bg-white p-5 text-left shadow-2xl">
                    <p className="text-base font-medium text-slate-700">Start a group chat</p>
                    <div className="mt-2 rounded-md border-b-2 border-teal-500 bg-slate-100 px-3 py-2">
                      <input
                        ref={quickGroupInputRef}
                        value={quickGroupQuery}
                        onChange={(event) => {
                          setQuickGroupQuery(event.target.value);
                          setQuickGroupStatus('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            if (quickGroupCandidates.length > 0 && !quickGroupCanInviteEmail) {
                              selectQuickGroupUser(quickGroupCandidates[0]);
                              return;
                            }

                            createQuickGroupConversation();
                          }

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            resetQuickGroupComposer();
                          }
                        }}
                        placeholder="Enter name, email or phone number"
                        className="w-full border-0 bg-transparent px-0 py-0 text-base text-slate-900 outline-none placeholder:text-slate-500"
                      />
                    </div>

                    {quickGroupSelectedUsers.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quickGroupSelectedUsers.map((selectedUser) => (
                          <span key={selectedUser.id} className="inline-flex max-w-full items-center gap-2 rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800 ring-1 ring-teal-100">
                            <span className="truncate">{displayUser(selectedUser)}</span>
                            <button
                              type="button"
                              onClick={() => setQuickGroupSelectedUsers((items) => items.filter((item) => item.id !== selectedUser.id))}
                              className="font-bold text-teal-500 hover:text-teal-900"
                              aria-label={`Remove ${displayUser(selectedUser)}`}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {(quickGroupQuery.trim() || quickGroupCanInviteEmail) && (
                      <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
                        {quickGroupCandidates.length > 0 ? (
                          quickGroupCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => selectQuickGroupUser(candidate)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <UserAvatar
                                displayName={displayUser(candidate)}
                                email={candidate.email}
                                profilePictureUrl={candidate.profilePictureUrl}
                                status={getUserStatus(candidate.id)}
                                showStatus
                                size="sm"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-slate-900">{displayUser(candidate)}</span>
                                <span className="block truncate text-xs text-slate-500">{candidate.email}{candidate.phoneNumber ? ` - ${candidate.phoneNumber}` : ''}</span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-sm text-slate-500">
                            {quickGroupCanInviteEmail ? `Invite ${quickGroupEmail} by email` : 'No matching people found.'}
                          </p>
                        )}
                      </div>
                    )}

                    {quickGroupStatus && <p className="mt-3 text-sm font-medium text-red-600">{quickGroupStatus}</p>}

                    <div className="mt-5 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={resetQuickGroupComposer}
                        className="min-w-32 rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={createQuickGroupConversation}
                        disabled={!quickGroupCanCreate || creatingQuickGroup}
                        className="min-w-32 rounded-md bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {creatingQuickGroup ? 'Creating...' : 'Create'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatSearch('');
                  setHeaderMenuOpen(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                title="Search chats"
                aria-label="Search chats"
              >
                <SearchIcon className="h-5 w-5" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen((open) => !open);
                    setQuickGroupOpen(false);
                  }}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 ${headerMenuOpen ? 'bg-slate-100' : ''}`}
                  title="More"
                  aria-label="More"
                  aria-expanded={headerMenuOpen}
                >
                  <MoreHorizontalIcon className="h-5 w-5" />
                </button>
                {headerMenuOpen && (
                  <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setNewChatOpen(true);
                        setHeaderMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <PencilIcon className="h-4 w-4 text-slate-500" />
                      New chat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickGroupOpen(true);
                        setHeaderMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <PeoplePlusIcon className="h-4 w-4 text-slate-500" />
                      Start a group chat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('files');
                        setHeaderMenuOpen(false);
                      }}
                      disabled={!selectedConversation}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-400"
                    >
                      <PaperclipIcon className="h-4 w-4 text-slate-500" />
                      View files
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('photos');
                        setHeaderMenuOpen(false);
                      }}
                      disabled={!selectedConversation}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-400"
                    >
                      <ImageIcon className="h-4 w-4 text-slate-500" />
                      View photos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('tasks');
                        setHeaderMenuOpen(false);
                      }}
                      disabled={!selectedConversation}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-400"
                    >
                      <TaskIcon className="h-4 w-4 text-slate-500" />
                      View tasks
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('calls');
                        setHeaderMenuOpen(false);
                      }}
                      disabled={!selectedConversation}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:text-slate-400"
                    >
                      <PhoneCallIcon className="h-4 w-4 text-slate-500" />
                      View calls
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
          {isDraggingAttachment && selectedConversation && (
            <div className="pointer-events-none absolute inset-x-4 bottom-24 top-24 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-teal-400 bg-teal-50/90 text-sm font-semibold text-teal-800">
              Drop files to share
            </div>
          )}

          <main
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDraggingAttachment(false)}
            onDrop={handleDrop}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white px-6 py-6"
          >
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Choose a chat or start a new one.</div>
            ) : activeTab === 'files' ? (
              <div className="mx-auto max-w-3xl space-y-3">
                {selectedFiles.length === 0 ? (
                  <p className="text-sm text-slate-500">No files shared in this chat yet.</p>
                ) : selectedFiles.map((message) => (
                  <div key={message.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{message.attachmentFileName || 'Attachment'}</p>
                      <p className="text-xs text-slate-500">{message.senderName} - {formatFileSize(message.attachmentSizeBytes)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => setDocumentPreview(message)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Preview
                      </button>
                      <button onClick={() => setShareMessage(message)} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100">
                        Email
                      </button>
                      <button onClick={() => downloadAttachment(message)} className="rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === 'photos' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedPhotos.length === 0 ? (
                  <p className="text-sm text-slate-500">No photos shared in this chat yet.</p>
                ) : selectedPhotos.map((message) => (
                  <button key={message.id} onClick={() => downloadAttachment(message)} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left">
                    <img src={resolveApiAssetUrl(message.attachmentUrl)} alt={message.attachmentFileName || 'Shared photo'} className="h-44 w-full object-cover" />
                    <span className="block truncate px-3 py-2 text-xs text-slate-600">{message.attachmentFileName || 'Photo'}</span>
                  </button>
                ))}
              </div>
            ) : activeTab === 'calls' ? (
              <div className="mx-auto max-w-4xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Calls in this chat</h3>
                    <p className="text-sm text-slate-500">{unseenCallCount} unseen call{unseenCallCount === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={loadConversationCallHistory}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(getOrganizationScopedPath('/calls'))}
                      className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                    >
                      All calls
                    </button>
                  </div>
                </div>

                {callHistoryError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {callHistoryError}
                  </div>
                )}

                {callHistoryLoading ? (
                  <div className="rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Loading call history...
                  </div>
                ) : callHistory.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No calls have been made in this chat yet.
                  </div>
                ) : callHistory.map((call) => {
                  const incoming = call.recipientUserId === user?.id;
                  const otherName = incoming ? call.callerName : call.recipientName;
                  const canCallBack = call.status === 'Accepted' || call.status === 'Declined' || call.status === 'NoResponse';

                  return (
                    <article key={call.id} className={`rounded-md border bg-white p-4 shadow-sm ${call.isSeen ? 'border-slate-200' : 'border-teal-200 ring-2 ring-teal-50'}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${incoming ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'}`}>
                              {call.callType === 'video' ? <VideoCallIcon className="h-5 w-5" /> : <PhoneCallIcon className="h-5 w-5" />}
                            </span>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-slate-950">{otherName}</h4>
                              <p className="text-xs text-slate-500">
                                {incoming ? 'Incoming' : 'Outgoing'} {call.callType} call - {formatScheduledDate(call.createdAt)}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${getCallStatusClass(call, user?.id)}`}>
                              {getCallStatusLabel(call, user?.id)}
                            </span>
                            {!call.isSeen && <span className="rounded-full bg-teal-600 px-2 py-1 text-xs font-semibold text-white">New</span>}
                          </div>
                          <p className="mt-3 truncate text-sm text-slate-600">
                            {call.meetingTitle || selectedTitle}{call.meetingStartTime ? ` - ${formatScheduledDate(call.meetingStartTime)}` : ''}
                          </p>
                          {call.cancellationMessage && (
                            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{call.cancellationMessage}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {!call.isSeen && (
                            <button
                              type="button"
                              onClick={() => markCallSeen(call)}
                              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Mark seen
                            </button>
                          )}
                          {canCallBack && (
                            <button
                              type="button"
                              onClick={() => callBackFromHistory(call)}
                              className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                            >
                              Call back
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openUrlInNewTab(call.joinUrl || getMeetingJoinUrl(call.meetingId))}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => clearCallFromChat(call)}
                            className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : activeTab === 'tasks' ? (
              <div className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <TaskIcon className="h-5 w-5 text-teal-700" />
                    <h3 className="text-base font-semibold text-slate-900">Create task</h3>
                  </div>
                  {taskSourceMessage && (
                    <div className="mt-3 rounded-md border-l-4 border-teal-500 bg-white px-3 py-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-900">From message</p>
                      <p className="mt-1 line-clamp-2">{getMessagePreview(taskSourceMessage)}</p>
                      <button type="button" onClick={() => setTaskSourceMessage(null)} className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900">
                        Clear source
                      </button>
                    </div>
                  )}
                  <input
                    value={taskDraft}
                    onChange={(event) => setTaskDraft(event.target.value)}
                    placeholder="Task title"
                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                  <textarea
                    value={taskDescriptionDraft}
                    onChange={(event) => setTaskDescriptionDraft(event.target.value)}
                    rows={3}
                    placeholder="Description"
                    className="mt-3 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      value={taskPriorityDraft}
                      onChange={(event) => setTaskPriorityDraft(event.target.value as ConversationTask['priority'])}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                    >
                      {(['Low', 'Normal', 'High', 'Urgent'] as const).map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                    <select
                      value={taskAssigneeDraft}
                      onChange={(event) => setTaskAssigneeDraft(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                    >
                      <option value="">Unassigned</option>
                      {selectedConversation.members.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.userName}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="datetime-local"
                    value={taskDueDraft}
                    onChange={(event) => setTaskDueDraft(event.target.value)}
                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={createTask}
                    disabled={creatingTask || !taskDraft.trim()}
                    className="mt-3 w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {creatingTask ? 'Creating...' : 'Create task'}
                  </button>
                </section>

                <section className="min-w-0 space-y-3">
                  <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                    <input
                      value={taskQuery}
                      onChange={(event) => setTaskQuery(event.target.value)}
                      placeholder="Search tasks"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                    <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500">
                      {['All', 'Pending', 'InProgress', 'Completed'].map((status) => (
                        <option key={status} value={status}>{status === 'InProgress' ? 'In progress' : status}</option>
                      ))}
                    </select>
                    <select value={taskPriorityFilter} onChange={(event) => setTaskPriorityFilter(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500">
                      {['All', 'Low', 'Normal', 'High', 'Urgent'].map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </div>

                  {filteredTasks.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No tasks match this view.
                    </div>
                  ) : filteredTasks.map((task) => (
                    <article key={task.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-base font-semibold text-slate-900">{task.title}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${getTaskStatusClass(task.status)}`}>{formatTaskStatus(task.status)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${getTaskPriorityClass(task.priority)}`}>{task.priority}</span>
                          </div>
                          {task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>}
                          <p className="mt-2 text-xs text-slate-500">
                            Owner: {task.ownerName} {task.assigneeName || task.assigneeEmail ? `- Assigned to ${task.assigneeName || task.assigneeEmail}` : '- Unassigned'}
                            {task.dueDate ? ` - Due ${formatScheduledDate(task.dueDate)}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <select
                            value={task.status}
                            onChange={(event) => updateTask(task, { status: event.target.value as ConversationTask['status'] })}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <option value="Pending">Pending</option>
                            <option value="InProgress">In progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                          {task.status === 'Completed' && (
                            <button type="button" onClick={() => updateTask(task, { status: 'Pending' })} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              Reopen
                            </button>
                          )}
                          {task.sourceMessageId && (
                            <button type="button" onClick={() => openTaskSourceMessage(task)} className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100">
                              Open message
                            </button>
                          )}
                          <button type="button" onClick={() => deleteTask(task)} className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                            Delete
                          </button>
                        </div>
                      </div>

                      {task.activities && task.activities.length > 0 && (
                        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
                          <div className="mt-2 space-y-1">
                            {task.activities.slice(0, 3).map((activity) => (
                              <p key={activity.id} className="text-xs text-slate-600">
                                <span className="font-semibold">{activity.actorName}</span> {activity.action.toLowerCase()} {activity.details ? `- ${activity.details}` : ''} · {formatScheduledDate(activity.createdAt)}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        <input
                          value={taskNoteDrafts[task.id] || ''}
                          onChange={(event) => setTaskNoteDrafts((items) => ({ ...items, [task.id]: event.target.value }))}
                          placeholder="Add task note"
                          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
                        />
                        <button type="button" onClick={() => addTaskNote(task)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                          Add
                        </button>
                      </div>
                      {task.notes && task.notes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {task.notes.slice(0, 2).map((note) => (
                            <p key={note.id} className="rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
                              <span className="font-semibold text-slate-800">{note.authorName}</span>: {note.note}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Start the conversation.</div>
            ) : (
              <div className="w-full space-y-4">
                {messages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  const isEditing = editingMessageId === message.id;
                  const isQueued = Boolean(message.deliveryStatus && message.deliveryStatus !== 'sent');
                  const canEdit = isMine && !!message.message && !isQueued;
                  const reactionGroups = summarizeReactions(message.reactions);
                  const highlighted = highlightMessageId === message.id;
                  return (
                    <div
                      key={message.id}
                      id={`message-${message.id}`}
                      className={`group relative flex w-full gap-3 rounded-md pt-3 transition ${highlighted ? 'bg-amber-50/80 ring-2 ring-amber-200' : ''} ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMine && (
                        <div className="pt-5">
                          <UserAvatar
                            displayName={message.senderName}
                            profilePictureUrl={getUserAvatar(message.senderId)}
                            status={getUserStatus(message.senderId)}
                            showStatus
                            size="sm"
                          />
                        </div>
                      )}
                      <div className={`flex min-w-0 max-w-[72%] flex-col lg:max-w-[680px] ${isMine ? 'items-end' : 'items-start'}`}>
                        {!isEditing && !isQueued && (
                          <div className={`pointer-events-none absolute -top-1 z-20 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700 opacity-0 shadow-lg transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${isMine ? 'right-0' : 'left-14'}`}>
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(message, emoji)}
                                disabled={reactingMessageId === message.id}
                                className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-slate-100 disabled:opacity-50"
                                title={`React ${emoji}`}
                                aria-label={`React ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setReactionPickerMessageId((current) => (current === message.id ? null : message.id))}
                                className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100"
                                title="More reactions"
                                aria-label="More reactions"
                              >
                                <SmilePlusIcon className="h-5 w-5" />
                              </button>
                              {reactionPickerMessageId === message.id && (
                                <div className={`absolute top-10 z-30 flex rounded-md border border-slate-200 bg-white p-1 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>
                                  {EXTRA_REACTIONS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => toggleReaction(message, emoji)}
                                      disabled={reactingMessageId === message.id}
                                      className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-slate-100 disabled:opacity-50"
                                      title={`React ${emoji}`}
                                      aria-label={`React ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="mx-1 h-6 w-px bg-slate-200" />
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => startEditingMessage(message)}
                                className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100"
                                title="Edit message"
                                aria-label="Edit message"
                              >
                                <PencilIcon className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setMessageMenuId((current) => (current === message.id ? null : message.id));
                                setReactionPickerMessageId(null);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100"
                              title="More options"
                              aria-label="More options"
                              aria-expanded={messageMenuId === message.id}
                            >
                              <MoreHorizontalIcon className="h-5 w-5" />
                            </button>
                            {messageMenuId === message.id && (
                              <div className={`absolute top-10 z-50 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-2xl ${isMine ? 'right-0' : 'left-0'}`}>
                                <button
                                  type="button"
                                  onClick={() => startReplyMessage(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <ReplyIcon className="h-4 w-4 text-slate-500" />
                                  Reply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => forwardMessage(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <ForwardIcon className="h-4 w-4 text-slate-500" />
                                  Forward
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyMessageLink(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <LinkIcon className="h-4 w-4 text-slate-500" />
                                  Copy link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePinMessage(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <PinIcon className="h-4 w-4 text-slate-500" />
                                  {message.isPinned ? 'Unpin for everyone' : 'Pin for everyone'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startTaskFromMessage(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <TaskIcon className="h-4 w-4 text-slate-500" />
                                  Create task
                                </button>
                                {message.attachmentUrl && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDocumentPreview(message);
                                        setMessageMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                    >
                                      <SearchIcon className="h-4 w-4 text-slate-500" />
                                      Preview file
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShareMessage(message);
                                        setMessageMenuId(null);
                                      }}
                                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                    >
                                      <ForwardIcon className="h-4 w-4 text-slate-500" />
                                      Share by email
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => markMessageUnread(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <UnreadIcon className="h-4 w-4 text-slate-500" />
                                  Mark as unread
                                </button>
                                <button
                                  type="button"
                                  onClick={() => showTranslationPanel(message)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                >
                                  <TranslateIcon className="h-4 w-4 text-slate-500" />
                                  Translation
                                </button>
                                {isMine && (
                                  <button
                                    type="button"
                                    onClick={() => deleteConversationMessage(message)}
                                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`mb-1 flex max-w-full items-center gap-2 text-xs text-slate-500 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          {message.isPinned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                              <PinIcon className="h-3 w-3" />
                              Pinned
                            </span>
                          )}
                          {message.isImportant && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-100">
                              <ImportantIcon className="h-3 w-3" />
                              Important
                            </span>
                          )}
                          {!isMine && <span className="truncate font-medium text-slate-600">{message.senderName}</span>}
                          <span className="shrink-0">{formatMessageTime(message.sentAt)}</span>
                          {message.editedAt && <span className="shrink-0">Edited</span>}
                          {isQueued && (
                            <span className={`shrink-0 font-semibold ${
                              message.deliveryStatus === 'retrying' ? 'text-blue-600' : 'text-amber-600'
                            }`}>
                              {message.deliveryStatus === 'retrying' ? 'Sending...' : 'Queued'}
                            </span>
                          )}
                        </div>
                        <div className={`max-w-full rounded-md px-4 py-2.5 text-sm shadow-sm ${
                          isMine ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-900'
                        }`}>
                          {isEditing ? (
                            <div className="w-[min(520px,70vw)] max-w-full space-y-2">
                              <textarea
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    saveEditedMessage(message);
                                  }

                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelEditingMessage();
                                  }
                                }}
                                rows={Math.min(6, Math.max(2, editDraft.split('\n').length))}
                                autoFocus
                                className="max-h-48 w-full resize-none rounded-md border border-white/30 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-2 ring-transparent focus:ring-white/60"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditImportant((value) => !value)}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${editImportant ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 'bg-white/15 text-white hover:bg-white/25'}`}
                                >
                                  <ImportantIcon className="h-3.5 w-3.5" />
                                  Important
                                </button>
                                <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEditingMessage}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
                                  title="Cancel edit"
                                  aria-label="Cancel edit"
                                >
                                  <XIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEditedMessage(message)}
                                  disabled={editSaving || !editDraft.trim()}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                                  title="Save edit"
                                  aria-label="Save edit"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {message.replyToPreview && (
                                <button
                                  type="button"
                                  onClick={() => setMessageActionStatus(`Replying to ${message.replyToSenderName || 'a message'}`)}
                                  className={`mb-2 block max-w-full rounded-md border-l-4 px-3 py-2 text-left text-xs ${
                                    isMine ? 'border-white/70 bg-white/10 text-teal-50' : 'border-teal-400 bg-white text-slate-600'
                                  }`}
                                >
                                  <span className="block truncate font-semibold">{message.replyToSenderName || 'Reply'}</span>
                                  <span className="block truncate">{message.replyToPreview}</span>
                                </button>
                              )}
                              {message.message && <FormattedMessage message={message.message} isMine={isMine} />}
                            </>
                          )}
                          {message.attachmentUrl && (
                            <div className={`mt-3 min-w-[220px] overflow-hidden rounded-md border ${isMine ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-white'}`}>
                              {isImageAttachment(message) && (
                                <img src={resolveApiAssetUrl(message.attachmentUrl)} alt={message.attachmentFileName || 'Attachment'} className="max-h-64 w-full object-cover" />
                              )}
                              <div className="px-3 py-2">
                                <p className="break-words text-sm font-semibold">{message.attachmentFileName || 'Attachment'}</p>
                                <p className={`mt-1 text-xs ${isMine ? 'text-teal-50' : 'text-slate-500'}`}>
                                  {[message.attachmentContentType, formatFileSize(message.attachmentSizeBytes)].filter(Boolean).join(' - ') || 'File'}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => setDocumentPreview(message)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                      isMine ? 'bg-white/15 text-white hover:bg-white/25' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    Preview
                                  </button>
                                  <button
                                    onClick={() => setShareMessage(message)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                      isMine ? 'bg-white/15 text-white hover:bg-white/25' : 'border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                                    }`}
                                  >
                                    Email
                                  </button>
                                  <button
                                    onClick={() => downloadAttachment(message)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                      isMine ? 'bg-white text-teal-700 hover:bg-teal-50' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {reactionGroups.length > 0 && (
                          <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {reactionGroups.map(([emoji, reactions]) => {
                              const reactedByMe = reactions.some((reaction) => reaction.userId === user?.id);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => toggleReaction(message, emoji)}
                                  disabled={reactingMessageId === message.id}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm ${
                                    reactedByMe
                                      ? 'border-teal-300 bg-teal-50 text-teal-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                  title={reactions.map((reaction) => reaction.userName).join(', ')}
                                  aria-label={`${reactions.length} reaction${reactions.length === 1 ? '' : 's'} ${emoji}`}
                                >
                                  <span>{emoji}</span>
                                  <span>{reactions.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {isQueued && (
                          <p className={`mt-1 max-w-full text-xs font-medium ${
                            message.deliveryStatus === 'retrying' ? 'text-blue-600' : 'text-amber-600'
                          }`}>
                            {message.deliveryStatus === 'retrying'
                              ? 'Trying again now'
                              : `Will retry automatically${message.deliveryError ? ` - ${message.deliveryError}` : ''}`}
                          </p>
                        )}
                        {translationMessageId === message.id && (
                          <div className={`mt-2 max-w-full rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800 shadow-sm ${isMine ? 'text-right' : 'text-left'}`}>
                            Translation is ready for the selected message once language support is connected.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          <footer className="max-h-[42vh] shrink-0 overflow-y-auto overflow-x-hidden border-t border-slate-200 bg-white px-8 py-4">
            {messageActionStatus && (
              <div className="mx-auto mb-3 flex max-w-5xl items-center justify-between gap-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                <span className="min-w-0 break-all">{messageActionStatus}</span>
                <button
                  type="button"
                  onClick={() => setMessageActionStatus('')}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-700 hover:bg-white"
                  title="Dismiss"
                  aria-label="Dismiss message"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {queuedMessageCount > 0 && (
              <div className="mx-auto mb-3 flex max-w-5xl items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-100">
                <span>{queuedMessageCount} message{queuedMessageCount === 1 ? '' : 's'} waiting in outbox. Samvaad will retry automatically.</span>
                <button
                  type="button"
                  onClick={retryQueuedMessages}
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  Try now
                </button>
              </div>
            )}
            {scheduledMessages.length > 0 && (
              <div className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-2">
                {scheduledMessages.map((message) => (
                  <span key={message.id} className="inline-flex max-w-full items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-amber-100">
                    <ClockIcon className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="max-w-[280px] truncate">{message.message}</span>
                    <span className="shrink-0 font-medium text-amber-700">{formatScheduledDate(message.scheduledFor)}</span>
                    <button
                      type="button"
                      onClick={() => cancelScheduledMessage(message.id)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-red-600"
                      title="Cancel scheduled message"
                      aria-label="Cancel scheduled message"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {replyingToMessage && (
              <div className="mx-auto mb-3 flex max-w-5xl items-start gap-3 rounded-md border-l-4 border-teal-500 bg-teal-50 px-3 py-2">
                <ReplyIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold text-teal-900">Replying to {replyingToMessage.senderName}</p>
                  <p className="truncate text-teal-700">{getMessagePreview(replyingToMessage)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-teal-700 hover:bg-white"
                  title="Cancel reply"
                  aria-label="Cancel reply"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            {pendingFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {pendingFilePreviews.map(({ file, previewUrl }, index) => (
                  <span key={fileKey(file)} className="inline-flex max-w-full items-center gap-2 rounded-md bg-teal-50 px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-teal-100">
                    {previewUrl && (
                      <img src={previewUrl} alt="" className="h-12 w-16 rounded object-cover ring-1 ring-teal-100" />
                    )}
                    <span className="max-w-48 truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-red-600"
                      title="Remove file"
                      aria-label={`Remove ${file.name}`}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachmentStatus && <p className="mb-3 text-sm font-medium text-amber-700">{attachmentStatus}</p>}
            {scheduleOpen && (
              <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <ClockIcon className="h-5 w-5 text-amber-700" />
                <input
                  type="datetime-local"
                  value={scheduleFor}
                  onChange={(event) => setScheduleFor(event.target.value)}
                  className="rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-200"
                />
                <button
                  type="button"
                  onClick={scheduleMessage}
                  disabled={scheduling || !selectedConversation || !messageDraft.trim()}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {scheduling ? 'Scheduling...' : 'Schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white"
                  title="Close scheduler"
                  aria-label="Close scheduler"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="mx-auto flex max-w-5xl items-end gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    addPendingFiles(event.target.files);
                  }
                  event.target.value = '';
                }}
              />
              <textarea
                ref={messageInputRef}
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onPaste={handleMessagePaste}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' && !event.shiftKey && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
                    if (editLastOwnMessage()) {
                      event.preventDefault();
                    }
                    return;
                  }

                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                    return;
                  }

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const nextDraft = `${messageDraft.slice(0, start)}  ${messageDraft.slice(end)}`;
                    setMessageDraft(nextDraft);
                    window.requestAnimationFrame(() => {
                      target.selectionStart = start + 2;
                      target.selectionEnd = start + 2;
                    });
                  }
                }}
                rows={Math.min(5, Math.max(1, messageDraft.split('\n').length))}
                disabled={!selectedConversation}
                readOnly={sending}
                placeholder={selectedConversation ? 'Type a message' : 'Select a chat first'}
                className="max-h-36 min-w-0 flex-1 resize-none border-0 px-1 py-1 text-sm outline-none disabled:bg-white read-only:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setImportantDraft((value) => !value)}
                disabled={!selectedConversation || sending}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-50 ${importantDraft ? 'bg-red-50 text-red-700 ring-1 ring-red-100' : 'text-slate-500 hover:bg-slate-100'}`}
                title={importantDraft ? 'Marked important' : 'Mark important'}
                aria-label={importantDraft ? 'Marked important' : 'Mark important'}
              >
                <ImportantIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = '';
                    fileInputRef.current.click();
                  }
                }}
                disabled={!selectedConversation || sending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="Attach file"
                aria-label="Attach file"
              >
                <PaperclipIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'image/*';
                    fileInputRef.current.click();
                  }
                }}
                disabled={!selectedConversation || sending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                title="Attach image"
                aria-label="Attach image"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen((open) => !open)}
                disabled={!selectedConversation || sending}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 disabled:opacity-50 ${scheduleOpen ? 'bg-amber-50 text-amber-700' : 'text-slate-500'}`}
                title="Schedule message"
                aria-label="Schedule message"
              >
                <ClockIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={!selectedConversation || sending || (!messageDraft.trim() && pendingFiles.length === 0)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                title={sending ? 'Sending' : 'Send message'}
                aria-label={sending ? 'Sending' : 'Send message'}
              >
                <SendIcon className="h-5 w-5" />
              </button>
            </div>
          </footer>
        </section>
      </div>

      {documentPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-900">{documentPreview.attachmentFileName || 'Document preview'}</h2>
                <p className="text-xs text-slate-500">{[documentPreview.attachmentContentType, formatFileSize(documentPreview.attachmentSizeBytes)].filter(Boolean).join(' - ')}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadAttachment(documentPreview)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Download
                </button>
                <button type="button" onClick={() => setDocumentPreview(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label="Close preview">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 bg-slate-100 p-3">
              {documentPreviewError ? (
                <div className="flex h-full items-center justify-center rounded-md bg-white text-sm text-slate-500">{documentPreviewError}</div>
              ) : !documentPreviewUrl ? (
                <div className="flex h-full items-center justify-center rounded-md bg-white text-sm text-slate-500">Loading preview...</div>
              ) : documentPreview.attachmentContentType?.startsWith('image/') ? (
                <div className="flex h-full items-center justify-center overflow-auto rounded-md bg-white">
                  <img src={documentPreviewUrl} alt={documentPreview.attachmentFileName || 'Preview'} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <iframe title={documentPreview.attachmentFileName || 'Document preview'} src={documentPreviewUrl} className="h-full w-full rounded-md border-0 bg-white" />
              )}
            </div>
          </section>
        </div>
      )}

      {shareMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section className="w-full max-w-lg rounded-md bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">Share document by email</h2>
                <p className="mt-1 truncate text-sm text-slate-500">{shareMessage.attachmentFileName || 'Attachment'}</p>
              </div>
              <button type="button" onClick={() => setShareMessage(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close share dialog">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={shareEmailsDraft}
              onChange={(event) => setShareEmailsDraft(event.target.value)}
              rows={3}
              placeholder="name@example.com, teammate@example.com"
              className="mt-4 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            <textarea
              value={shareNoteDraft}
              onChange={(event) => setShareNoteDraft(event.target.value)}
              rows={3}
              placeholder="Optional message"
              className="mt-3 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareMessage(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={shareDocumentByEmail} disabled={sharingDocument || !shareEmailsDraft.trim()} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {sharingDocument ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </section>
        </div>
      )}

      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <section className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">New chat</h2>
              <button onClick={() => setNewChatOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Close
              </button>
            </div>
            <div className="mt-4 rounded-md border border-slate-300 bg-white p-1">
              <button
                onClick={() => {
                  setMode('direct');
                  setSelectedUserIds([]);
                  setInviteEmails([]);
                  setRequestStatus('');
                }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'direct' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                Direct
              </button>
              <button
                onClick={() => {
                  setMode('group');
                  setSelectedUserIds([]);
                  setInviteEmails([]);
                  setRequestStatus('');
                }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'group' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                Group
              </button>
            </div>
            {mode === 'group' && (
              <input
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
                placeholder="Group name"
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
            )}
            <input
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder="Search people or type an email"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />

            <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto">
              {users.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">No registered users found.</p>
                  {canAddEmailInvite && (
                    <button onClick={addEmailInvite} className="w-full rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-left text-sm font-medium text-teal-800 hover:bg-teal-100">
                      Add email invite: {userQuery.trim()}
                    </button>
                  )}
                </div>
              ) : users.map((item) => {
                const isSelected = selectedUserIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      toggleUser(item.id);
                      setRequestStatus('');
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      isSelected ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          displayName={displayUser(item)}
                          email={item.email}
                          profilePictureUrl={item.profilePictureUrl}
                          status={getUserStatus(item.id)}
                          showStatus
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{displayUser(item)}</p>
                            <UserStatusBadge status={getUserStatus(item.id)} />
                          </div>
                          <p className="truncate text-xs text-slate-500">{item.email}</p>
                        </div>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPeople.length > 0 && (
              <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Sending to {selectedPeople.map(displayUser).join(', ')}
              </div>
            )}
            {inviteEmails.length > 0 && (
              <div className="mt-3 space-y-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">Pending email invite{inviteEmails.length === 1 ? '' : 's'}</p>
                {inviteEmails.map((email) => (
                  <div key={email} className="flex items-center justify-between gap-2">
                    <span className="truncate">{email}</span>
                    <button onClick={() => setInviteEmails((items) => items.filter((item) => item !== email))} className="font-semibold text-amber-900 hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={createConversation}
              disabled={recipientCount === 0 || (mode === 'direct' && recipientCount !== 1)}
              className="mt-5 w-full rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {requestStatus === 'Sending request...' ? 'Sending...' : 'Send chat request'}
            </button>
            {requestStatus && requestStatus !== 'Sending request...' && (
              <p className="mt-2 text-sm font-medium text-emerald-700">{requestStatus}</p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
