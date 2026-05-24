import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProfileStatusMenu, UserAvatar, UserStatus, statusLabel } from '../components/UserStatus';
import { conversationAPI, getMeetingJoinUrl, getOrganizationScopedPath, meetingAPI, userAPI } from '../services/api';
import {
  initializeSignalR,
  joinMeetingGroup,
  joinUserNotifications,
  leaveMeetingGroup,
  notifyMeetingEnded,
  notifyLobbyDecision,
  notifyLobbyRequest,
  notifyParticipantEngagementChanged,
  notifyParticipantJoined,
  notifyParticipantLeft,
  notifyParticipantMediaStatusChanged,
  notifyUserStatusChanged,
  notifyWhiteboardUpdated,
  onDirectChatMessage,
  onLobbyDecisionReceived,
  onLobbyRequestReceived,
  onMeetingEnded,
  onMeetingChatMessage,
  onIncomingCallResponse,
  onParticipantEngagementChanged,
  onParticipantJoined,
  onParticipantLeft,
  onParticipantMediaStatusChanged,
  onUserStatusChanged,
  onWhiteboardUpdated,
  onWebRtcAnswer,
  onWebRtcIceCandidate,
  onWebRtcOffer,
  sendDirectChatMessage,
  sendMeetingChatMessage,
  sendWebRtcAnswer,
  sendWebRtcIceCandidate,
  sendWebRtcOffer,
  startSignalR,
} from '../services/signalR';
import { useAuthStore } from '../store/authStore';
import { Meeting } from '../store/meetingStore';

interface Participant {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
  isHandRaised: boolean;
  reaction?: string;
  joinedAt: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

interface UserSummary {
  id: string;
  email: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  status?: string;
}

interface ChatMessage {
  id: string;
  scope: 'group' | 'direct';
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  recipientUserId?: string;
  recipientName?: string;
}

function getRequestErrorMessage(err: any, fallback: string) {
  const messageText = `${err?.message || ''} ${err?.response?.data || ''}`;
  if (messageText.includes('HubException') && messageText.includes('SendIncomingCallCancelled')) {
    return 'Call stop is not active on the running notification service yet. Restart the NotificationService, then this button will stop the ring immediately.';
  }

  const data = err?.response?.data;
  if (!data) {
    return err?.message || fallback;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (typeof data.detail === 'string') {
    return data.detail;
  }

  if (typeof data.title === 'string') {
    return data.title;
  }

  if (typeof data.message === 'string') {
    return data.message;
  }

  if (data.errors && typeof data.errors === 'object') {
    const firstError = Object.values(data.errors).flat().find(Boolean);
    if (typeof firstError === 'string') {
      return firstError;
    }
  }

  return fallback;
}

function mapChatMessage(message: any): ChatMessage {
  return {
    id: message.id,
    scope: message.scope === 'Direct' ? 'direct' : 'group',
    senderId: message.senderId,
    senderName: message.senderName,
    recipientUserId: message.recipientUserId,
    recipientName: message.recipientName,
    message: message.message,
    timestamp: message.sentAt,
  };
}

interface LobbyRequest {
  id: string;
  userName: string;
  userEmail: string;
  status: string;
  requestedAt: string;
}

interface RemoteStream {
  userId: string;
  userName: string;
  stream: MediaStream;
}

interface PendingMeetingImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
}

interface OutgoingMeetingCall {
  callLogId?: string;
  userId: string;
  email: string;
  displayName: string;
  status: 'Ringing' | 'Accepted' | 'Joined' | 'Declined' | 'No response' | 'Cancelled' | 'Failed';
  sentAt: string;
}

type InviteResponseStatus = 'Pending' | 'Accepted' | 'Declined' | 'Tentative';

interface MeetingInvite {
  id: string;
  meetingId: string;
  email: string;
  displayName?: string;
  role: string;
  isRequired: boolean;
  hasAccepted: boolean;
  responseStatus: InviteResponseStatus;
  responseReason?: string;
  respondedAt?: string;
  createdAt: string;
}

interface FloatingReaction {
  id: string;
  userId: string;
  userName: string;
  reaction: string;
}

interface WhiteboardPoint {
  x: number;
  y: number;
}

interface WhiteboardItem {
  id: string;
  kind: 'stroke' | 'text';
  points?: WhiteboardPoint[];
  text?: string;
  x?: number;
  y?: number;
  color: string;
  size: number;
  authorName: string;
}

type SidePanelTab = 'participants' | 'chat' | 'details' | 'whiteboard';

const CALL_CANCEL_MESSAGE = 'Sorry, I called you by mistake.';
const QUICK_REACTIONS = ['👍', '👏', '❤️', '😊', '😂', '🎉'];

interface IconButtonProps {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  className?: string;
}

function IconButton({ title, children, onClick, disabled, active, danger, className = '' }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-500/40 bg-red-600 text-white hover:bg-red-700'
          : active
            ? 'border-white bg-white text-slate-950'
            : 'border-white/10 bg-slate-800 text-slate-100 hover:bg-white/10'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 10.5a3 3 0 1 0 0-6M15.5 14.2A5 5 0 0 1 21 19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-5 4v-4.2A3.5 3.5 0 0 1 3.5 11.5v-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5M12 7.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {off && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

function VideoIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h7A2.5 2.5 0 0 1 17 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 10 3.5-2v8L17 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {off && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

function ScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 13.5v-7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 16v4M8.5 20h7M12 12V8m0 0-2 2m2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PresentingPresenceIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17h-11A2.5 2.5 0 0 1 4 14.5v-8Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 14V8m0 0-2.25 2.25M12 8l2.25 2.25M8.5 20h7M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LivePresenceIndicator({ label, kind, compact = false }: { label: string; kind: 'call' | 'presenting'; compact?: boolean }) {
  const textClass = kind === 'presenting' ? 'text-red-200' : 'text-rose-200';

  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'} ${textClass}`}>
      {kind === 'presenting' ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-red-500/20 text-red-200">
          <PresentingPresenceIcon className="h-3 w-3" />
        </span>
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

function HandRaisedIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7.5 13.5V7.2a1.25 1.25 0 0 1 2.5 0v5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12.5V5.8a1.25 1.25 0 0 1 2.5 0v6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 12.2V7a1.25 1.25 0 0 1 2.5 0v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15 13.3l1.9-2.5a1.35 1.35 0 0 1 2.2 1.55l-2.85 4.2A5.2 5.2 0 0 1 11.95 19H11a5 5 0 0 1-5-5v-1.8a1.25 1.25 0 0 1 2.5 0V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.7 5.2 4.4 3.8M18.2 6l1.4-1.4M12 2.8V1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RecordIcon({ active = false }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.8" />
      {active && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 13.5a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 10.5a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m14 4 6 6-3 1-4 4 .5 4.5L4.5 10.5 9 11l4-4 1-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4 5h16v14H4V5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 5v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      {exit ? (
        <>
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m4 5 16 7-16 7 3-7-3-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 12h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M20 12a8 8 0 0 1-14.7 4.4M4 12A8 8 0 0 1 18.7 7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 17H2v-3M19 7h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M9 7 5 11l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11h8a5 5 0 1 1 0 10H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m15 7 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 11h-8a5 5 0 1 0 0 10h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M6.5 4h8.2L18 7.3v10.2A2.5 2.5 0 0 1 15.5 20h-9A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 4v4h4M8 12h6M8 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RemoteVideoTile({ remote }: { remote: RemoteStream }) {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remote.stream;
    }
  }, [remote.stream]);

  return (
    <div className="relative flex h-full min-h-[180px] items-center justify-center overflow-hidden rounded-md bg-slate-950">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="h-full max-h-full w-full object-contain"
      />
      <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">{remote.userName}</div>
    </div>
  );
}

function getRtcConfiguration(): RTCConfiguration {
  const turnUrls = import.meta.env.VITE_TURN_URLS?.split(',').map((url: string) => url.trim()).filter(Boolean) || [];
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
  const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return { iceServers };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
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

function displayKnownUser(user: UserSummary) {
  return user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
}

function inviteResponseClass(status?: string) {
  switch (status) {
    case 'Accepted':
      return 'bg-emerald-500/15 text-emerald-200';
    case 'Declined':
      return 'bg-red-500/15 text-red-200';
    case 'Tentative':
      return 'bg-amber-500/15 text-amber-200';
    default:
      return 'bg-slate-700 text-slate-200';
  }
}

function resolveRecordingUrl(recordingUrl?: string) {
  if (!recordingUrl) {
    return '';
  }

  if (recordingUrl.startsWith('http')) {
    return recordingUrl;
  }

  return `http://localhost:5000${recordingUrl}`;
}

function parseWhiteboardData(value?: string): WhiteboardItem[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as WhiteboardItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeWhiteboardData(items: WhiteboardItem[]) {
  return JSON.stringify(items.slice(-300));
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

function linkifyChatMessageText(message: string, isMine: boolean) {
  return message.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part.startsWith('http')) {
      return part;
    }

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-semibold underline underline-offset-2 ${isMine ? 'text-white' : 'text-blue-200'}`}
      >
        {part}
      </a>
    );
  });
}

function renderChatMessageText(message: string, isMine: boolean) {
  const lines = message.split('\n');
  const imageLines = lines.filter((line) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(line.trim()));
  const text = lines.filter((line) => !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(line.trim())).join('\n').trim();

  if (imageLines.length > 0) {
    return (
      <div className="space-y-2">
        {text && (
          <p className="whitespace-pre-wrap break-words">
            {linkifyChatMessageText(text, isMine)}
          </p>
        )}
        {imageLines.map((line, index) => (
          <a key={`${line.slice(0, 40)}-${index}`} href={line.trim()} target="_blank" rel="noreferrer" className="block">
            <img
              src={line.trim()}
              alt="Shared screenshot"
              className="max-h-72 max-w-full rounded-md border border-white/10 object-contain"
            />
          </a>
        ))}
      </div>
    );
  }

  if (looksLikeCode(message) || message.trim().startsWith('```')) {
    return (
      <pre className={`mt-1 max-h-80 overflow-auto rounded-md border px-3 py-2 text-left font-mono text-xs leading-relaxed ${isMine ? 'border-white/20 bg-blue-700 text-white' : 'border-white/10 bg-slate-950 text-slate-100'}`}>
        <code className="whitespace-pre">{stripCodeFence(message)}</code>
      </pre>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {linkifyChatMessageText(message, isMine)}
    </p>
  );
}

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [meetingInvites, setMeetingInvites] = useState<MeetingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(() => new URLSearchParams(window.location.search).get('call') !== 'audio');
  const [screenSharing, setScreenSharing] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [pendingMeetingImages, setPendingMeetingImages] = useState<PendingMeetingImage[]>([]);
  const [isDraggingMeetingImage, setIsDraggingMeetingImage] = useState(false);
  const [chatRecipient, setChatRecipient] = useState('everyone');
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activeSidePanelTab, setActiveSidePanelTab] = useState<SidePanelTab>('details');
  const [sidePanelWidth, setSidePanelWidth] = useState(340);
  const [isResizingSidePanel, setIsResizingSidePanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [meetingActionOpen, setMeetingActionOpen] = useState(false);
  const [lobbyRequests, setLobbyRequests] = useState<LobbyRequest[]>([]);
  const [waitingForLobby, setWaitingForLobby] = useState(false);
  const [lobbyAdmitted, setLobbyAdmitted] = useState(false);
  const [focusedRemoteUserId, setFocusedRemoteUserId] = useState<string | null>(null);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
  const [inviteResponseReason, setInviteResponseReason] = useState('');
  const [inviteResponseStatus, setInviteResponseStatus] = useState('');
  const [inviteCallStatuses, setInviteCallStatuses] = useState<Record<string, OutgoingMeetingCall>>({});
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState('');
  const [knownUsers, setKnownUsers] = useState<UserSummary[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([]);
  const [whiteboardRedoItems, setWhiteboardRedoItems] = useState<WhiteboardItem[]>([]);
  const [whiteboardTool, setWhiteboardTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [whiteboardColor, setWhiteboardColor] = useState('#14b8a6');
  const [whiteboardSize, setWhiteboardSize] = useState(4);
  const [whiteboardText, setWhiteboardText] = useState('');
  const [whiteboardStatus, setWhiteboardStatus] = useState('');
  const roomRef = useRef<HTMLDivElement | null>(null);
  const whiteboardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const whiteboardDraftRef = useRef<WhiteboardItem | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoEnabledRef = useRef(videoEnabled);
  const remoteStreamsRef = useRef<RemoteStream[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingCanvasIntervalRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingAudioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordingAudioTrackKeysRef = useRef<Set<string>>(new Set());
  const recordingVideoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const recordingStartedAtRef = useRef(0);
  const recordingStopRequestedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const inviteResponseAppliedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const currentParticipantRef = useRef<Participant | null>(null);
  const inviteCallStatusesRef = useRef<Record<string, OutgoingMeetingCall>>({});
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === roomRef.current);
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    if (currentParticipant) {
      setActiveSidePanelTab('participants');
    }
  }, [currentParticipant?.id]);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  const displayName = useMemo(() => {
    if (!user) {
      return 'Guest';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const getUserStatus = (userId?: string, email?: string) => {
    if (userId && statusOverrides[userId]) {
      return statusOverrides[userId];
    }

    if (userId && user?.id === userId) {
      return user.status || 'Available';
    }

    const knownUser = knownUsers.find((item) => item.id === userId || item.email.toLowerCase() === email?.toLowerCase());
    return knownUser?.status || 'Available';
  };

  const getUserAvatar = (userId?: string, email?: string) => {
    if (userId && user?.id === userId) {
      return user.profilePictureUrl;
    }

    const knownUser = knownUsers.find((item) => item.id === userId || item.email.toLowerCase() === email?.toLowerCase());
    return knownUser?.profilePictureUrl
      || accounts.find((account) => account.user.id === userId || account.user.email.toLowerCase() === email?.toLowerCase())?.user.profilePictureUrl;
  };

  const isOrganizer = meeting?.organizerId === user?.id || currentParticipant?.role === 'Organizer';
  const meetingEndsAt = meeting
    ? new Date(meeting.endTime || new Date(meeting.startTime).getTime() + (meeting.durationMinutes || 60) * 60000)
    : null;
  const meetingHasEnded = Boolean(meeting && (
    meeting.status === 'Completed'
    || meeting.status === 'Cancelled'
    || (meetingEndsAt && meetingEndsAt <= new Date())
  ));
  const canJoinMeeting = Boolean(meeting && !meetingHasEnded && meeting.status !== 'Cancelled');
  const currentUserInvite = useMemo(() => {
    const currentEmail = user?.email?.toLowerCase();
    if (!currentEmail) {
      return undefined;
    }

    return meetingInvites.find((invite) => invite.email.toLowerCase() === currentEmail);
  }, [meetingInvites, user?.email]);
  const searchableInviteUsers = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    const participantIds = new Set(participants.map((participant) => participant.userId).filter(Boolean));
    const participantEmails = new Set(participants.map((participant) => participant.userEmail.toLowerCase()).filter(Boolean));

    return knownUsers
      .filter((item) => item.id !== user?.id)
      .filter((item) => !participantIds.has(item.id) && !participantEmails.has(item.email.toLowerCase()))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return item.email.toLowerCase().includes(query)
          || displayKnownUser(item).toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [inviteSearch, knownUsers, participants, user?.id]);

  const currentUserId = user?.id || currentParticipant?.userId || '';
  const autoJoinRequested = useMemo(() => new URLSearchParams(window.location.search).get('autojoin') === '1', []);
  const inviteResponseFromQuery = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('response');
    return value === 'Accepted' || value === 'Declined' || value === 'Tentative' ? value : null;
  }, []);
  const inviteIdFromQuery = useMemo(() => new URLSearchParams(window.location.search).get('inviteId'), []);

  const getParticipantPresenceLabel = (participant: Participant) => {
    if (isParticipantPresenting(participant)) {
      return 'Presenting';
    }

    return 'In call';
  };

  const getParticipantPresenceKind = (participant: Participant): 'call' | 'presenting' => (
    isParticipantPresenting(participant) ? 'presenting' : 'call'
  );

  const getParticipantPresenceStatus = (participant: Participant): UserStatus => (
    getUserStatus(participant.userId, participant.userEmail) === 'Offline'
      ? 'Offline'
      : isParticipantPresenting(participant)
        ? 'DoNotDisturb'
        : 'Busy'
  );

  const sortedParticipants = useMemo(() => (
    participants
      .map((participant, index) => ({ participant, index }))
      .sort((left, right) => {
        if (left.participant.isHandRaised !== right.participant.isHandRaised) {
          return left.participant.isHandRaised ? -1 : 1;
        }

        return left.index - right.index;
      })
      .map((item) => item.participant)
  ), [participants]);

  const activePresenterId = useMemo(
    () => sortedParticipants.find((participant) => participant.isScreenSharing)?.id || null,
    [sortedParticipants],
  );

  function isParticipantPresenting(participant: Participant) {
    return Boolean(activePresenterId && participant.id === activePresenterId && participant.isScreenSharing);
  }

  const raisedHandParticipants = useMemo(
    () => sortedParticipants.filter((participant) => participant.isHandRaised),
    [sortedParticipants],
  );

  const raisedHandCount = raisedHandParticipants.length;

  const raisedHandSummary = useMemo(() => {
    if (raisedHandParticipants.length === 0) {
      return '';
    }

    const firstParticipant = raisedHandParticipants[0];
    const firstName = firstParticipant.userId === user?.id || firstParticipant.id === currentParticipant?.id
      ? 'You'
      : firstParticipant.userName;
    const remainingCount = raisedHandParticipants.length - 1;

    return remainingCount > 0 ? `${firstName} +${remainingCount}` : firstName;
  }, [currentParticipant?.id, raisedHandParticipants, user?.id]);

  const showFloatingReaction = (userId: string, userName: string, reaction?: string | null) => {
    if (!reaction) {
      return;
    }

    const reactionId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFloatingReactions((items) => [...items, { id: reactionId, userId, userName, reaction }].slice(-8));
    window.setTimeout(() => {
      setFloatingReactions((items) => items.filter((item) => item.id !== reactionId));
    }, 3500);
  };

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    currentParticipantRef.current = currentParticipant;
  }, [currentParticipant]);

  useEffect(() => {
    inviteCallStatusesRef.current = inviteCallStatuses;
  }, [inviteCallStatuses]);

  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

  const drawWhiteboard = () => {
    const canvas = whiteboardCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    [...whiteboardItems, whiteboardDraftRef.current].filter(Boolean).forEach((item) => {
      const boardItem = item as WhiteboardItem;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = boardItem.color;
      context.fillStyle = boardItem.color;
      context.lineWidth = boardItem.size;
      if (boardItem.kind === 'text') {
        context.font = `${Math.max(14, boardItem.size * 4)}px Segoe UI, Arial`;
        context.fillText(boardItem.text || '', boardItem.x || 20, boardItem.y || 40);
        return;
      }

      const points = boardItem.points || [];
      if (points.length < 2) {
        return;
      }

      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
    });
  };

  useEffect(() => {
    drawWhiteboard();
  }, [whiteboardItems]);

  useEffect(() => {
    setInviteResponseReason(currentUserInvite?.responseReason || '');
    setInviteResponseStatus('');
  }, [currentUserInvite?.id, currentUserInvite?.responseReason]);

  useEffect(() => {
    if (Object.keys(inviteCallStatuses).length === 0) {
      return;
    }

    setInviteCallStatuses((items) => {
      let changed = false;
      const next = { ...items };
      participants.forEach((participant) => {
        if (participant.userId && (next[participant.userId]?.status === 'Ringing' || next[participant.userId]?.status === 'Accepted')) {
          next[participant.userId] = {
            ...next[participant.userId],
            displayName: participant.userName || next[participant.userId].displayName,
            status: 'Joined',
          };
          changed = true;
        }
      });

      return changed ? next : items;
    });
  }, [inviteCallStatuses, participants]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    connectRecordingAudioTracks('local', localStream);
    remoteStreams.forEach((remote) => connectRecordingAudioTracks(remote.userId, remote.stream));
  }, [isRecording, localStream, remoteStreams]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadMeeting = async () => {
      try {
        const [meetingResponse, participantsResponse, chatResponse, invitesResponse, callLogsResponse, usersResponse, profileResponse] = await Promise.all([
          meetingAPI.getMeeting(id),
          meetingAPI.getParticipants(id),
          meetingAPI.getChatMessages(id).catch(() => ({ data: [] })),
          meetingAPI.getInvites(id).catch(() => ({ data: [] })),
          meetingAPI.getCallLogs(id).catch(() => ({ data: [] })),
          userAPI.searchUsers().catch(() => ({ data: [] })),
          userAPI.getProfile().catch(() => ({ data: user })),
        ]);
        setMeeting(meetingResponse.data);
        setMeetingNotes(meetingResponse.data.notes || '');
        setWhiteboardItems(parseWhiteboardData(meetingResponse.data.whiteboardData));
        setParticipants(participantsResponse.data);
        setMeetingInvites(invitesResponse.data);
        setKnownUsers(usersResponse.data);
        if (profileResponse.data) {
          setUser(profileResponse.data);
        }
        setChatMessages(chatResponse.data.map(mapChatMessage));
        const currentUserId = profileResponse.data?.id || user?.id;
        if (currentUserId) {
          const outgoingCalls = (callLogsResponse.data || [])
            .filter((call: any) => call.callerUserId === currentUserId)
            .slice(0, 8)
            .reduce((items: Record<string, OutgoingMeetingCall>, call: any) => {
              if (items[call.recipientUserId]) {
                return items;
              }

              const status: OutgoingMeetingCall['status'] = call.status === 'Accepted'
                ? 'Accepted'
                : call.status === 'Declined'
                  ? 'Declined'
                  : call.status === 'Cancelled'
                    ? 'Cancelled'
                    : call.status === 'NoResponse'
                      ? 'No response'
                      : call.status === 'Failed'
                        ? 'Failed'
                        : 'Ringing';

              items[call.recipientUserId] = {
                callLogId: call.id,
                userId: call.recipientUserId,
                email: call.recipientEmail,
                displayName: call.recipientName || call.recipientEmail,
                status,
                sentAt: call.createdAt,
              };
              return items;
            }, {});
          setInviteCallStatuses(outgoingCalls);
        }
      } catch (err: any) {
        setError(getRequestErrorMessage(err, 'Unable to load meeting'));
      } finally {
        setLoading(false);
      }
    };

    loadMeeting();
  }, [id, user?.id, setUser]);

  const getParticipantName = (userId: string) => {
    return participantsRef.current.find((participant) => participant.userId === userId)?.userName || 'Participant';
  };

  const removeRemotePeer = (userId: string) => {
    peerConnectionsRef.current[userId]?.close();
    delete peerConnectionsRef.current[userId];
    delete pendingIceCandidatesRef.current[userId];
    setRemoteStreams((streams) => streams.filter((remote) => remote.userId !== userId));
  };

  const replaceOutgoingVideoTrack = async (track: MediaStreamTrack | null) => {
    await Promise.all(
      Object.entries(peerConnectionsRef.current).map(async ([remoteUserId, connection]) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === 'video');

        if (sender) {
          await sender.replaceTrack(track);
          return;
        }

        if (!track || !id || !currentUserId || connection.signalingState !== 'stable') {
          return;
        }

        connection.addTrack(track, localStreamRef.current || new MediaStream([track]));
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendWebRtcOffer(id, currentUserId, remoteUserId, JSON.stringify(offer));
      }),
    );
  };

  const getLiveVideoTrack = () => {
    return localStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live') || null;
  };

  const attachLocalVideoTrack = async (track: MediaStreamTrack) => {
    const existingStream = localStreamRef.current;
    existingStream?.getVideoTracks().forEach((existingTrack) => {
      if (existingTrack.id !== track.id) {
        existingTrack.stop();
      }
    });

    const nextStream = new MediaStream([
      ...(existingStream?.getAudioTracks() || []),
      track,
    ]);

    localStreamRef.current = nextStream;
    setLocalStream(nextStream);
    await replaceOutgoingVideoTrack(screenStreamRef.current?.getVideoTracks()[0] || track);
  };

  const ensureLocalVideoTrack = async () => {
    const existingTrack = getLiveVideoTrack();
    if (existingTrack) {
      existingTrack.enabled = true;
      await replaceOutgoingVideoTrack(screenStreamRef.current?.getVideoTracks()[0] || existingTrack);
      return existingTrack;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not available in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const [track] = stream.getVideoTracks();
    if (!track) {
      throw new Error('No camera track was returned');
    }

    track.enabled = true;
    track.addEventListener('ended', () => {
      setVideoEnabled(false);
      setLocalStream((currentStream) => {
        if (!currentStream) {
          localStreamRef.current = null;
          return null;
        }

        const nextStream = new MediaStream(currentStream.getAudioTracks());
        localStreamRef.current = nextStream;
        return nextStream;
      });
      replaceOutgoingVideoTrack(null).catch(() => undefined);
    });

    await attachLocalVideoTrack(track);
    return track;
  };

  const getRecordingVideoElement = (key: string, stream: MediaStream | null) => {
    let video = recordingVideoElementsRef.current[key];
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      recordingVideoElementsRef.current[key] = video;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }

    return video;
  };

  const drawRecordingTile = (
    context: CanvasRenderingContext2D,
    source: { key: string; label: string; stream: MediaStream | null; initials: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    context.fillStyle = '#020617';
    context.fillRect(x, y, width, height);

    const hasLiveVideo = source.stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
    const video = getRecordingVideoElement(source.key, source.stream);

    if (hasLiveVideo && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    } else {
      context.fillStyle = '#1e3a8a';
      context.beginPath();
      context.arc(x + width / 2, y + height / 2, Math.min(width, height) * 0.16, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = `${Math.max(26, Math.floor(Math.min(width, height) * 0.16))}px Segoe UI, Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(source.initials.slice(0, 2).toUpperCase(), x + width / 2, y + height / 2);
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(x + 10, y + height - 38, Math.min(width - 20, 260), 28);
    context.fillStyle = '#ffffff';
    context.font = '16px Segoe UI, Arial';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(source.label, x + 20, y + height - 24, width - 40);
  };

  const drawRecordingFrame = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, width, height);

    const localSource = {
      key: 'local',
      label: `${displayName} (You)`,
      stream: localStreamRef.current,
      initials: displayName.charAt(0) || 'Y',
    };
    const remoteSources = remoteStreamsRef.current.map((remote) => ({
      key: remote.userId,
      label: remote.userName,
      stream: remote.stream,
      initials: remote.userName.charAt(0) || 'P',
    }));
    const screenTrack = screenStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');

    if (screenTrack && screenStreamRef.current) {
      drawRecordingTile(context, {
        key: 'screen',
        label: 'Screen share',
        stream: screenStreamRef.current,
        initials: 'S',
      }, 0, 0, width, height);

      const thumbnails = [localSource, ...remoteSources].slice(0, 5);
      thumbnails.forEach((source, index) => {
        const tileWidth = 210;
        const tileHeight = 118;
        const x = 18 + index * (tileWidth + 12);
        const y = height - tileHeight - 18;
        drawRecordingTile(context, source, x, y, tileWidth, tileHeight);
      });
      return;
    }

    const sources = [localSource, ...remoteSources];
    const count = Math.max(1, sources.length);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const gap = 18;
    const tileWidth = (width - gap * (columns + 1)) / columns;
    const tileHeight = (height - gap * (rows + 1)) / rows;

    sources.forEach((source, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (tileWidth + gap);
      const y = gap + row * (tileHeight + gap);
      drawRecordingTile(context, source, x, y, tileWidth, tileHeight);
    });
  };

  const cleanupRecordingResources = () => {
    if (recordingCanvasIntervalRef.current) {
      window.clearInterval(recordingCanvasIntervalRef.current);
      recordingCanvasIntervalRef.current = null;
    }

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recordingStartedAtRef.current = 0;
    recordingStopRequestedRef.current = false;
    recordingAudioDestinationRef.current = null;
    recordingAudioSourcesRef.current = [];
    recordingAudioTrackKeysRef.current.clear();
    recordingAudioContextRef.current?.close().catch(() => undefined);
    recordingAudioContextRef.current = null;
    Object.values(recordingVideoElementsRef.current).forEach((video) => {
      video.pause();
      video.srcObject = null;
    });
    recordingVideoElementsRef.current = {};
  };

  const connectRecordingAudioTracks = (sourceKey: string, stream: MediaStream | null) => {
    const audioContext = recordingAudioContextRef.current;
    const destination = recordingAudioDestinationRef.current;
    if (!audioContext || !destination) {
      return;
    }

    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === 'live') || [];
    tracks.forEach((track) => {
      const trackKey = `${sourceKey}:${track.id}`;
      if (recordingAudioTrackKeysRef.current.has(trackKey)) {
        return;
      }

      const audioSource = audioContext.createMediaStreamSource(new MediaStream([track]));
      audioSource.connect(destination);
      recordingAudioSourcesRef.current.push(audioSource);
      recordingAudioTrackKeysRef.current.add(trackKey);
    });
  };

  const createRecordingStream = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    drawRecordingFrame(canvas);
    recordingCanvasIntervalRef.current = window.setInterval(() => drawRecordingFrame(canvas), 1000 / 15);

    const canvasStream = canvas.captureStream(15);
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    const destination = audioContext.createMediaStreamDestination();
    recordingAudioContextRef.current = audioContext;
    recordingAudioDestinationRef.current = destination;
    recordingAudioSourcesRef.current = [];
    recordingAudioTrackKeysRef.current.clear();

    connectRecordingAudioTracks('local', localStreamRef.current);
    remoteStreamsRef.current.forEach((remote) => connectRecordingAudioTracks(remote.userId, remote.stream));

    return new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
  };

  const uploadRecordingBlob = async (blob: Blob) => {
    if (!id || !meeting) {
      throw new Error('Meeting is not loaded');
    }

    const formData = new FormData();
    const safeTitle = meeting.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'meeting';
    formData.append('recording', blob, `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`);
    const response = await meetingAPI.uploadRecording(id, formData);
    setMeeting(response.data);
    return response.data as Meeting;
  };

  const shareRecordingInChat = async (updatedMeeting: Meeting) => {
    if (!id || !currentParticipant || !updatedMeeting.recordingUrl) {
      return;
    }

    const senderId = user?.id || currentParticipant.userId;
    const recordingUrl = resolveRecordingUrl(updatedMeeting.recordingUrl);
    const message = `Recording is ready: ${recordingUrl}`;
    const saved = await meetingAPI.sendChatMessage(id, {
      senderId,
      senderName: displayName,
      message,
    });
    setChatMessages((messages) => [...messages, mapChatMessage(saved.data)]);
    await sendMeetingChatMessage(id, senderId, displayName, message).catch(() => undefined);
  };

  const getMediaRecorderOptions = () => {
    const supportedType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));

    return supportedType ? { mimeType: supportedType } : undefined;
  };

  const startRecording = async () => {
    if (!meeting?.allowRecording || !currentParticipant || !isOrganizer) {
      setRecordingStatus('Recording is not available for this meeting');
      return;
    }

    if (!window.MediaRecorder) {
      setRecordingStatus('Recording is not supported in this browser');
      return;
    }

    try {
      setRecordingStatus('Preparing recording...');
      recordingChunksRef.current = [];
      recordingStopRequestedRef.current = false;
      const recordingStream = await createRecordingStream();
      recordingStreamRef.current = recordingStream;
      const recorder = new MediaRecorder(recordingStream, getMediaRecorderOptions());
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        cleanupRecordingResources();

        if (blob.size === 0) {
          setRecordingStatus('Recording was empty. Please record for at least a few seconds.');
          return;
        }

        try {
          setRecordingStatus('Saving recording...');
          const updatedMeeting = await uploadRecordingBlob(blob);
          try {
            await shareRecordingInChat(updatedMeeting);
            setRecordingStatus('Recording saved and shared in chat');
            setActivity((items) => ['Recording saved and shared in chat', ...items].slice(0, 5));
          } catch {
            setRecordingStatus('Recording saved, but chat link could not be shared');
            setActivity((items) => ['Recording saved', ...items].slice(0, 5));
          }
        } catch {
          setRecordingStatus('Recording could not be uploaded');
        }
      };

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      setRecordingStatus('Recording in progress');
    } catch {
      cleanupRecordingResources();
      setIsRecording(false);
      setRecordingStatus('Recording could not be started');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording' && !recordingStopRequestedRef.current) {
      recordingStopRequestedRef.current = true;
      setRecordingStatus('Stopping recording...');
      const elapsedMilliseconds = Date.now() - recordingStartedAtRef.current;
      const stopDelayMilliseconds = Math.max(0, 1500 - elapsedMilliseconds);
      window.setTimeout(() => {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // Some browsers throw if the recorder has already queued its final chunk.
          }
          recorder.stop();
        }
      }, stopDelayMilliseconds);
    }
  };

  const enableRecording = async () => {
    if (!id || !meeting || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.updateMeeting(id, {
      title: meeting.title,
      description: meeting.description,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      durationMinutes: meeting.durationMinutes,
      attendeeEmails: meeting.attendeeEmails || [],
      location: meeting.location,
      isOnlineMeeting: meeting.isOnlineMeeting,
      lobbyEnabled: meeting.lobbyEnabled,
      allowChat: meeting.allowChat,
      allowReactions: meeting.allowReactions,
      allowScreenShare: meeting.allowScreenShare,
      allowAttendeeUnmute: meeting.allowAttendeeUnmute,
      allowRecording: true,
      allowTranscription: meeting.allowTranscription,
      recurrenceRule: meeting.recurrenceRule,
      maxParticipants: meeting.maxParticipants,
    });
    setMeeting(response.data);
    setRecordingStatus('Recording enabled');
  };

  const flushPendingIceCandidates = async (remoteUserId: string, connection: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current[remoteUserId] || [];
    delete pendingIceCandidatesRef.current[remoteUserId];

    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate);
    }
  };

  const createPeerConnection = (remoteUserId: string) => {
    if (!id) {
      return null;
    }

    const existing = peerConnectionsRef.current[remoteUserId];
    if (existing) {
      return existing;
    }

    const connection = new RTCPeerConnection(getRtcConfiguration());
    peerConnectionsRef.current[remoteUserId] = connection;

    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current as MediaStream);
    });

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      setRemoteStreams((streams) => {
        const userName = getParticipantName(remoteUserId);
        const existingStream = streams.find((remote) => remote.userId === remoteUserId);
        if (existingStream) {
          return streams.map((remote) => (remote.userId === remoteUserId ? { userId: remoteUserId, userName, stream } : remote));
        }

        return [...streams, { userId: remoteUserId, userName, stream }];
      });
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate || !currentUserId) {
        return;
      }

      sendWebRtcIceCandidate(id, currentUserId, remoteUserId, JSON.stringify(event.candidate)).catch((err) => {
        console.warn('Unable to send ICE candidate', err);
      });
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
        removeRemotePeer(remoteUserId);
      }
    };

    return connection;
  };

  const startCallWithParticipant = async (remoteUserId: string) => {
    if (!id || !currentUserId || !localStreamRef.current || remoteUserId === currentUserId) {
      return;
    }

    if (peerConnectionsRef.current[remoteUserId]) {
      return;
    }

    const connection = createPeerConnection(remoteUserId);
    if (!connection || connection.signalingState !== 'stable') {
      return;
    }

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await sendWebRtcOffer(id, currentUserId, remoteUserId, JSON.stringify(offer));
  };

  useEffect(() => {
    if (!id || !token) {
      return;
    }

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        await joinMeetingGroup(id);
        if (user?.id) {
          await joinUserNotifications(user.id);
        }
        onUserStatusChanged((data) => {
          setStatusOverrides((items) => ({ ...items, [data.userId]: data.status }));
          setKnownUsers((items) => items.map((item) => (
            item.id === data.userId ? { ...item, status: data.status } : item
          )));

          if (data.userId === user?.id && user) {
            setUser({ ...user, status: data.status });
          }
        });
        onParticipantJoined((data) => {
          setActivity((items) => [`${data.participantName} joined`, ...items].slice(0, 5));
          refreshParticipants().catch(() => undefined);
        });
        onParticipantLeft((data) => {
          setActivity((items) => [`${data.participantName} left`, ...items].slice(0, 5));
          refreshParticipants().catch(() => undefined);
        });
        onMeetingChatMessage((data) => {
          if (data.senderId === user?.id) {
            return;
          }
          setChatMessages((messages) => [
            ...messages,
            {
              id: `${data.timestamp}-${data.senderId}-${messages.length}`,
              scope: 'group',
              senderId: data.senderId,
              senderName: data.senderName,
              message: data.message,
              timestamp: data.timestamp,
            },
          ]);
        });
        onDirectChatMessage((data) => {
          if (data.senderId === user?.id) {
            return;
          }
          setChatMessages((messages) => [
            ...messages,
            {
              id: `${data.timestamp}-${data.senderId}-${messages.length}`,
              scope: 'direct',
              senderId: data.senderId,
              senderName: data.senderName,
              recipientUserId: data.recipientUserId,
              recipientName: data.recipientName,
              message: data.message,
              timestamp: data.timestamp,
            },
          ]);
        });
        onIncomingCallResponse((data) => {
          const callLogId = data.callLogId || data.CallLogId || '';
          const recipientUserId = data.recipientUserId || data.RecipientUserId || '';
          const recipientName = data.recipientName || data.RecipientName || 'User';
          const status = data.status || data.Status || '';
          const nextStatus: OutgoingMeetingCall['status'] = status === 'Accepted'
            ? 'Accepted'
            : status === 'Declined'
              ? 'Declined'
              : 'No response';

          setInviteCallStatuses((items) => {
            const matchingEntry = Object.entries(items).find(([, call]) => (
              (callLogId && call.callLogId === callLogId)
              || (recipientUserId && call.userId === recipientUserId)
            ));
            if (!matchingEntry) {
              return items;
            }

            const [key, call] = matchingEntry;
            if (call.status !== 'Ringing' && call.status !== 'Accepted') {
              return items;
            }

            return {
              ...items,
              [key]: {
                ...call,
                status: nextStatus,
              },
            };
          });

          setInviteStatus(`${recipientName}: ${nextStatus}`);
        });
        onParticipantMediaStatusChanged((data) => {
          const isCurrentUserEvent = data.userId === currentUserId;
          const anotherParticipantStartedPresenting = data.userId !== currentUserId && data.screenSharing;

          if (anotherParticipantStartedPresenting) {
            setScreenSharing(false);
            setCurrentParticipant((participant) => participant ? { ...participant, isScreenSharing: false } : participant);
            screenStreamRef.current?.getTracks().forEach((track) => track.stop());
            setScreenStream(null);
            replaceOutgoingVideoTrack(videoEnabledRef.current ? getLiveVideoTrack() : null).catch(() => undefined);
          }

          if (isCurrentUserEvent) {
            if (!data.audioEnabled) {
              setAudioEnabled(false);
              localStreamRef.current?.getAudioTracks().forEach((track) => {
                track.enabled = false;
              });
            }

            if (!data.videoEnabled) {
              setVideoEnabled(false);
              localStreamRef.current?.getVideoTracks().forEach((track) => {
                track.enabled = false;
              });
            }

            setScreenSharing(data.screenSharing);
            setCurrentParticipant((participant) => participant ? { ...participant, isScreenSharing: data.screenSharing } : participant);
          }

          setParticipants((items) => items.map((participant) => (
            participant.userId === data.userId
              ? {
                  ...participant,
                  isAudioEnabled: data.audioEnabled,
                  isVideoEnabled: data.videoEnabled,
                  isScreenSharing: data.screenSharing,
                }
              : data.screenSharing
                ? { ...participant, isScreenSharing: false }
                : participant
          )));
          setActivity((items) => [
            `${data.participantName} ${data.screenSharing ? 'started presenting' : data.audioEnabled ? 'updated media' : 'muted'}`,
            ...items,
          ].slice(0, 5));
        });
        onParticipantEngagementChanged((data) => {
          const userId = data.userId || data.UserId;
          const participantName = data.participantName || data.ParticipantName || 'Participant';
          const isHandRaised = Boolean(data.isHandRaised ?? data.IsHandRaised);
          const reaction = data.reaction || data.Reaction || null;

          setParticipants((items) => items.map((participant) => (
            participant.userId === userId
              ? {
                  ...participant,
                  isHandRaised,
                  reaction,
                }
              : participant
          )));

          if (reaction) {
            showFloatingReaction(userId, participantName, reaction);
            window.setTimeout(() => {
              setParticipants((items) => items.map((participant) => (
                participant.userId === userId ? { ...participant, reaction: undefined } : participant
              )));
            }, 3500);
          }

          if (isHandRaised) {
            setActivity((items) => [`${participantName} raised a hand`, ...items].slice(0, 5));
          }
        });
        onLobbyRequestReceived((data) => {
          if (!isOrganizer) {
            return;
          }

          setLobbyRequests((requests) => {
            if (requests.some((request) => request.id === data.requestId)) {
              return requests;
            }

            return [
              {
                id: data.requestId,
                userName: data.userName,
                userEmail: data.userEmail,
                status: 'Waiting',
                requestedAt: data.timestamp,
              },
              ...requests,
            ];
          });
          setActivity((items) => [`${data.userName} is waiting in the lobby`, ...items].slice(0, 5));
        });
        onLobbyDecisionReceived((data) => {
          if (data.userId === user?.id) {
            setWaitingForLobby(false);
            setLobbyAdmitted(data.admitted);
            setActivity((items) => [
              data.admitted ? 'You were admitted from the lobby' : 'Your lobby request was denied',
              ...items,
            ].slice(0, 5));
          }

          if (isOrganizer) {
            setLobbyRequests((requests) => requests.map((request) => (
              request.userName === data.userName
                ? { ...request, status: data.admitted ? 'Admitted' : 'Denied' }
              : request
            )));
          }
        });
        onWhiteboardUpdated((data) => {
          const whiteboardData = data.whiteboardData || data.WhiteboardData || '[]';
          setWhiteboardItems(parseWhiteboardData(whiteboardData));
          setWhiteboardRedoItems([]);
          setWhiteboardStatus(`Updated by ${data.userName || data.UserName || 'a participant'}`);
          window.setTimeout(() => setWhiteboardStatus(''), 1800);
        });
        onMeetingEnded(() => {
          localStreamRef.current?.getTracks().forEach((track) => track.stop());
          screenStreamRef.current?.getTracks().forEach((track) => track.stop());
          Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
          peerConnectionsRef.current = {};
          pendingIceCandidatesRef.current = {};
          cleanupRecordingResources();
          setRemoteStreams([]);
          setCurrentParticipant(null);
          setMeeting((current) => current ? { ...current, status: 'Completed' } : current);
          setActivity((items) => ['Organizer ended the meeting', ...items].slice(0, 5));
          navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
        });
        onWebRtcOffer(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = createPeerConnection(data.senderUserId);
            if (!connection) {
              return;
            }

            await connection.setRemoteDescription(JSON.parse(data.sdp));
            await flushPendingIceCandidates(data.senderUserId, connection);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendWebRtcAnswer(id, localUserId, data.senderUserId, JSON.stringify(answer));
          } catch (err) {
            console.warn('Unable to answer WebRTC offer', err);
          }
        });
        onWebRtcAnswer(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = peerConnectionsRef.current[data.senderUserId];
            if (!connection) {
              return;
            }

            await connection.setRemoteDescription(JSON.parse(data.sdp));
            await flushPendingIceCandidates(data.senderUserId, connection);
          } catch (err) {
            console.warn('Unable to accept WebRTC answer', err);
          }
        });
        onWebRtcIceCandidate(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = createPeerConnection(data.senderUserId);
            if (!connection) {
              return;
            }

            const candidate = JSON.parse(data.candidate);
            if (!connection.remoteDescription) {
              pendingIceCandidatesRef.current[data.senderUserId] = [
                ...(pendingIceCandidatesRef.current[data.senderUserId] || []),
                candidate,
              ];
              return;
            }

            await connection.addIceCandidate(candidate);
          } catch (err) {
            console.warn('Unable to add WebRTC ICE candidate', err);
          }
        });
      })
      .catch((signalRError) => {
        console.warn('SignalR connection failed', signalRError);
      });

    return () => {
      leaveMeetingGroup(id).catch(() => undefined);
    };
  }, [id, isOrganizer, setUser, token, user?.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream, screenStream]);

  useEffect(() => {
    if (!currentParticipant || !localStream || !currentUserId) {
      return;
    }

    participants
      .filter((participant) => participant.userId && participant.userId !== currentUserId)
      .forEach((participant) => {
        if (currentUserId.localeCompare(participant.userId) < 0) {
          startCallWithParticipant(participant.userId).catch((err) => {
            console.warn('Unable to start WebRTC call', err);
          });
        }
      });
  }, [currentParticipant, currentUserId, localStream, participants]);

  useEffect(() => {
    return () => {
      Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
      peerConnectionsRef.current = {};
      pendingIceCandidatesRef.current = {};
      cleanupRecordingResources();
      setRemoteStreams([]);
    };
  }, []);

  const refreshParticipants = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.getParticipants(id);
    setParticipants(response.data);
  };

  const refreshLobby = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.getLobbyRequests(id);
    setLobbyRequests(response.data);
  };

  const handleJoin = async () => {
    if (!id || !meeting) {
      return;
    }

    if (!canJoinMeeting) {
      setError('This meeting has ended. You can still view chat and recordings from the meeting details.');
      return;
    }

    setJoining(true);
    setError('');

    try {
      if (meeting.lobbyEnabled && meeting.organizerId !== user?.id && !lobbyAdmitted) {
        const response = await meetingAPI.requestLobbyAccess(id, {
          userEmail: user?.email || 'guest@example.com',
          userName: displayName,
        });
        setWaitingForLobby(true);
        await notifyLobbyRequest(
          id,
          response.data.id,
          response.data.userId || user?.id || '',
          response.data.userName || displayName,
          response.data.userEmail || user?.email || 'guest@example.com',
        );
        setActivity((items) => ['Request sent to the organizer', ...items].slice(0, 5));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoEnabled });
        setLocalStream(stream);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = audioEnabled;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = videoEnabled;
        });
      } catch {
        if (videoEnabled) {
          try {
            const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(audioOnlyStream);
            audioOnlyStream.getAudioTracks().forEach((track) => {
              track.enabled = audioEnabled;
            });
            setVideoEnabled(false);
            setActivity((items) => ['Camera could not be started. Joined with audio only.', ...items].slice(0, 5));
          } catch {
            setActivity((items) => ['Camera or microphone permission was not granted', ...items].slice(0, 5));
          }
        } else {
          setActivity((items) => ['Microphone permission was not granted', ...items].slice(0, 5));
        }
      }

      const response = await meetingAPI.joinMeeting(id, {
        userEmail: user?.email || 'guest@example.com',
        userName: displayName,
      });
      setCurrentParticipant(response.data);
      await refreshParticipants();
      if (response.data.role === 'Organizer') {
        await refreshLobby();
      }
      await notifyParticipantJoined(id, displayName);
    } catch (err: any) {
      setError(getRequestErrorMessage(err, 'Unable to join meeting'));
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!autoJoinRequested || autoJoinAttemptedRef.current || !meeting || !canJoinMeeting || currentParticipant || joining || waitingForLobby) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    handleJoin().catch(() => undefined);
  }, [autoJoinRequested, meeting, canJoinMeeting, currentParticipant, joining, waitingForLobby]);

  const handleLeave = async () => {
    if (!id || !currentParticipant) {
      navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
      return;
    }

    try {
      localStream?.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
      Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
      peerConnectionsRef.current = {};
      pendingIceCandidatesRef.current = {};
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupRecordingResources();
      }
      setRemoteStreams([]);
      await meetingAPI.leaveMeeting(id, currentParticipant.id);
      await notifyParticipantLeft(id, displayName);
    } finally {
      navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
    }
  };

  const handleEndMeeting = async () => {
    if (!id || !isOrganizer || endingMeeting) {
      return;
    }

    if (!window.confirm('End this meeting for everyone? Participants will be removed from the live session.')) {
      return;
    }

    setEndingMeeting(true);
    setError('');

    try {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupRecordingResources();
      }

      const response = await meetingAPI.endMeeting(id);
      setMeeting(response.data);
      localStream?.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
      Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
      peerConnectionsRef.current = {};
      pendingIceCandidatesRef.current = {};
      setRemoteStreams([]);
      await notifyMeetingEnded(id).catch(() => undefined);
      navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, 'Unable to end meeting'));
    } finally {
      setEndingMeeting(false);
    }
  };

  const handleSignOut = async () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    try {
      if (id && currentParticipant) {
        localStream?.getTracks().forEach((track) => track.stop());
        screenStream?.getTracks().forEach((track) => track.stop());
        Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
        peerConnectionsRef.current = {};
        pendingIceCandidatesRef.current = {};
        cleanupRecordingResources();
        setRemoteStreams([]);
        await meetingAPI.leaveMeeting(id, currentParticipant.id);
        await notifyParticipantLeft(id, displayName);
      }
    } finally {
      logout();
      navigate(hadOtherAccounts ? getOrganizationScopedPath('/dashboard') : '/login', { replace: true });
    }
  };

  const handleSwitchAccount = async (userId: string) => {
    try {
      if (id && currentParticipant) {
        localStream?.getTracks().forEach((track) => track.stop());
        screenStream?.getTracks().forEach((track) => track.stop());
        Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
        peerConnectionsRef.current = {};
        pendingIceCandidatesRef.current = {};
        cleanupRecordingResources();
        setRemoteStreams([]);
        await meetingAPI.leaveMeeting(id, currentParticipant.id);
        await notifyParticipantLeft(id, displayName);
      }
    } finally {
      switchAccount(userId);
      navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
    }
  };

  const updatePresenceStatus = async (status: UserStatus) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    setUser({ ...user, status });
    setStatusOverrides((items) => ({ ...items, [user.id]: status }));

    try {
      const response = await userAPI.updateStatus(status);
      setUser(response.data);
      setStatusOverrides((items) => ({ ...items, [user.id]: response.data.status }));
      await notifyUserStatusChanged(user.id, displayName, response.data.status).catch(() => undefined);
    } catch {
      setUser(previousUser);
      setStatusOverrides((items) => ({ ...items, [user.id]: previousUser.status || 'Available' }));
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

  const updateStatus = async (updates: Partial<{ audio: boolean; video: boolean; sharing: boolean }>) => {
    if (!id || !currentParticipant) {
      return;
    }

    const nextAudio = updates.audio ?? audioEnabled;
    const nextVideo = updates.video ?? videoEnabled;
    const nextSharing = updates.sharing ?? screenSharing;

    setAudioEnabled(nextAudio);
    setVideoEnabled(nextVideo);
    setScreenSharing(nextSharing);

    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = nextAudio;
    });

    if (updates.video !== undefined) {
      if (nextVideo) {
        try {
          await ensureLocalVideoTrack();
        } catch {
          setVideoEnabled(false);
          setActivity((items) => ['Camera could not be started. Check browser permission and camera availability.', ...items].slice(0, 5));
          return;
        }
      } else {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });

        if (!nextSharing) {
          await replaceOutgoingVideoTrack(null);
        }
      }
    } else {
      localStream?.getVideoTracks().forEach((track) => {
        track.enabled = nextVideo;
      });
    }

    if (updates.sharing !== undefined) {
      if (nextSharing) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          stream.getVideoTracks()[0]?.addEventListener('ended', () => {
            setScreenStream(null);
            setScreenSharing(false);
            replaceOutgoingVideoTrack(videoEnabled ? getLiveVideoTrack() : null).catch(() => undefined);
          });
          setScreenStream(stream);
          await replaceOutgoingVideoTrack(stream.getVideoTracks()[0] || null);
        } catch {
          setScreenSharing(false);
          return;
        }
      } else {
        screenStream?.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
        await replaceOutgoingVideoTrack(nextVideo ? getLiveVideoTrack() : null);
      }
    }

    await meetingAPI.updateParticipantStatus(id, currentParticipant.id, {
      audioEnabled: nextAudio,
      videoEnabled: nextVideo,
      screenSharing: nextSharing,
    });
    await notifyParticipantMediaStatusChanged(
      id,
      currentParticipant.userId,
      displayName,
      nextAudio,
      nextVideo,
      nextSharing,
    );
    await refreshParticipants();
  };

  const updateHandRaised = async () => {
    if (!id || !currentParticipant) {
      return;
    }

    const nextRaised = !currentParticipant.isHandRaised;
    const response = await meetingAPI.updateParticipantHand(id, currentParticipant.id, { isHandRaised: nextRaised });
    setCurrentParticipant(response.data);
    setParticipants((items) => items.map((participant) => (
      participant.id === response.data.id ? response.data : participant
    )));
    await notifyParticipantEngagementChanged(
      id,
      currentParticipant.userId,
      displayName,
      nextRaised,
      currentParticipant.reaction || null,
    ).catch(() => undefined);
  };

  const sendQuickReaction = async (reaction: string) => {
    if (!id || !currentParticipant || !meeting?.allowReactions) {
      return;
    }

    const response = await meetingAPI.updateParticipantReaction(id, currentParticipant.id, { reaction });
    setCurrentParticipant(response.data);
    setParticipants((items) => items.map((participant) => (
      participant.id === response.data.id ? response.data : participant
    )));
    showFloatingReaction(currentParticipant.userId, displayName, reaction);
    await notifyParticipantEngagementChanged(
      id,
      currentParticipant.userId,
      displayName,
      currentParticipant.isHandRaised,
      reaction,
    ).catch(() => undefined);

    window.setTimeout(() => {
      meetingAPI.updateParticipantReaction(id, currentParticipant.id, { reaction: null }).catch(() => undefined);
      setParticipants((items) => items.map((participant) => (
        participant.id === currentParticipant.id ? { ...participant, reaction: undefined } : participant
      )));
      setCurrentParticipant((participant) => participant ? { ...participant, reaction: undefined } : participant);
    }, 3500);
  };

  const readImageFile = (file: File) => new Promise<PendingMeetingImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`,
        name: file.name || 'screenshot.png',
        dataUrl: String(reader.result || ''),
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const addPendingMeetingImages = async (files: File[], sourceLabel: string) => {
    if (!currentParticipant) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setActivity((items) => ['Only screenshot or image files can be attached in meeting chat right now', ...items].slice(0, 5));
      return;
    }

    try {
      const images = await Promise.all(imageFiles.map(readImageFile));
      setPendingMeetingImages((items) => [...items, ...images]);
      setActivity((items) => [`${images.length} ${sourceLabel}${images.length === 1 ? '' : 's'} ready to send`, ...items].slice(0, 5));
    } catch {
      setActivity((items) => [`Could not read ${sourceLabel}`, ...items].slice(0, 5));
    }
  };

  const handleMeetingChatPaste = async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    await addPendingMeetingImages(imageFiles, 'screenshot');
  };

  const handleMeetingChatDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasJoined || Array.from(event.dataTransfer.items || []).every((item) => !item.type.startsWith('image/'))) {
      return;
    }

    event.preventDefault();
    setIsDraggingMeetingImage(true);
  };

  const handleMeetingChatDrop = async (event: ReactDragEvent<HTMLElement>) => {
    if (!hasJoined) {
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    setIsDraggingMeetingImage(false);
    await addPendingMeetingImages(files, 'image');
  };

  const removePendingMeetingImage = (imageId: string) => {
    setPendingMeetingImages((items) => items.filter((image) => image.id !== imageId));
  };

  const handleSendChat = async () => {
    const messageText = chatDraft.replace(/\s+$/, '');
    const imagePayload = pendingMeetingImages.map((image) => image.dataUrl).join('\n');
    const message = [messageText, imagePayload].filter(Boolean).join('\n');
    if (!id || !currentParticipant || (!messageText.trim() && pendingMeetingImages.length === 0)) {
      return;
    }

    setChatDraft('');
    setPendingMeetingImages([]);
    const senderId = user?.id || currentParticipant.userId;

    if (chatRecipient === 'everyone') {
      const saved = await meetingAPI.sendChatMessage(id, {
        senderId,
        senderName: displayName,
        message,
      });
      setChatMessages((messages) => [
        ...messages,
        {
          id: saved.data.id,
          scope: 'group',
          senderId: saved.data.senderId,
          senderName: saved.data.senderName,
          message: saved.data.message,
          timestamp: saved.data.sentAt,
        },
      ]);
      await sendMeetingChatMessage(id, senderId, displayName, message);
      return;
    }

    const recipient = participants.find((participant) => participant.userId === chatRecipient);
    if (!recipient) {
      return;
    }

    const saved = await meetingAPI.sendChatMessage(id, {
      senderId,
      senderName: displayName,
      recipientUserId: recipient.userId,
      recipientName: recipient.userName,
      message,
    });
    setChatMessages((messages) => [
      ...messages,
      {
        id: saved.data.id,
        scope: 'direct',
        senderId: saved.data.senderId,
        senderName: saved.data.senderName,
        recipientUserId: saved.data.recipientUserId,
        recipientName: saved.data.recipientName,
        message: saved.data.message,
        timestamp: saved.data.sentAt,
      },
    ]);

    await sendDirectChatMessage(
      id,
      recipient.userId,
      senderId,
      displayName,
      recipient.userName,
      message,
    );
  };

  const saveNotes = async () => {
    if (!id || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.updateNotes(id, { notes: meetingNotes });
    setMeeting(response.data);
  };

  const canEditWhiteboard = Boolean(isOrganizer || currentParticipant?.role === 'Presenter');

  const getWhiteboardPoint = (event: ReactPointerEvent<HTMLCanvasElement>): WhiteboardPoint => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const saveWhiteboard = async (items: WhiteboardItem[]) => {
    if (!id || !canEditWhiteboard) {
      return;
    }

    const whiteboardData = serializeWhiteboardData(items);
    setWhiteboardStatus('Saving...');
    try {
      const response = await meetingAPI.updateWhiteboard(id, { whiteboardData });
      setMeeting(response.data);
      setWhiteboardStatus('Saved');
      if (user) {
        await notifyWhiteboardUpdated(id, user.id, displayName, whiteboardData).catch(() => undefined);
      }
      window.setTimeout(() => setWhiteboardStatus(''), 1800);
    } catch (err: any) {
      setWhiteboardStatus(getRequestErrorMessage(err, 'Unable to save whiteboard'));
    }
  };

  const startWhiteboardDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEditWhiteboard || whiteboardTool === 'text') {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getWhiteboardPoint(event);
    whiteboardDraftRef.current = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: 'stroke',
      points: [point],
      color: whiteboardTool === 'eraser' ? '#ffffff' : whiteboardColor,
      size: whiteboardTool === 'eraser' ? Math.max(12, whiteboardSize * 3) : whiteboardSize,
      authorName: displayName,
    };
    drawWhiteboard();
  };

  const moveWhiteboardDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!whiteboardDraftRef.current || !canEditWhiteboard) {
      return;
    }

    whiteboardDraftRef.current.points = [
      ...(whiteboardDraftRef.current.points || []),
      getWhiteboardPoint(event),
    ];
    drawWhiteboard();
  };

  const finishWhiteboardDraw = () => {
    const draft = whiteboardDraftRef.current;
    if (!draft || !canEditWhiteboard) {
      return;
    }

    whiteboardDraftRef.current = null;
    if ((draft.points || []).length < 2) {
      drawWhiteboard();
      return;
    }

    const nextItems = [...whiteboardItems, draft];
    setWhiteboardItems(nextItems);
    setWhiteboardRedoItems([]);
    void saveWhiteboard(nextItems);
  };

  const addWhiteboardText = () => {
    if (!canEditWhiteboard || !whiteboardText.trim()) {
      return;
    }

    const nextItems = [
      ...whiteboardItems,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind: 'text' as const,
        text: whiteboardText.trim(),
        x: 36,
        y: 56 + whiteboardItems.filter((item) => item.kind === 'text').length * 34,
        color: whiteboardColor,
        size: whiteboardSize,
        authorName: displayName,
      },
    ];
    setWhiteboardItems(nextItems);
    setWhiteboardRedoItems([]);
    setWhiteboardText('');
    void saveWhiteboard(nextItems);
  };

  const undoWhiteboard = () => {
    if (!canEditWhiteboard || whiteboardItems.length === 0) {
      return;
    }

    const removed = whiteboardItems[whiteboardItems.length - 1];
    const nextItems = whiteboardItems.slice(0, -1);
    setWhiteboardItems(nextItems);
    setWhiteboardRedoItems((items) => [removed, ...items]);
    void saveWhiteboard(nextItems);
  };

  const redoWhiteboard = () => {
    if (!canEditWhiteboard || whiteboardRedoItems.length === 0) {
      return;
    }

    const [restored, ...rest] = whiteboardRedoItems;
    const nextItems = [...whiteboardItems, restored];
    setWhiteboardItems(nextItems);
    setWhiteboardRedoItems(rest);
    void saveWhiteboard(nextItems);
  };

  const clearWhiteboard = () => {
    if (!canEditWhiteboard) {
      return;
    }

    if (!window.confirm('Clear the shared whiteboard for everyone?')) {
      return;
    }

    setWhiteboardItems([]);
    setWhiteboardRedoItems([]);
    void saveWhiteboard([]);
  };

  const exportWhiteboardImage = () => {
    const canvas = whiteboardCanvasRef.current;
    if (!canvas) {
      return;
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${meeting?.title || 'meeting'}-whiteboard.png`;
    link.click();
  };

  const exportWhiteboardPdf = () => {
    const canvas = whiteboardCanvasRef.current;
    if (!canvas) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`<html><head><title>Whiteboard</title></head><body style="margin:0"><img src="${canvas.toDataURL('image/png')}" style="width:100%;height:auto" /></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const exportMeetingChat = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.exportChat(id);
    downloadBlob(new Blob([response.data], { type: 'text/plain' }), `${meeting?.title || 'meeting'}-chat.txt`);
  };

  const exportMeetingWhiteboardJson = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.exportWhiteboard(id);
    downloadBlob(new Blob([response.data], { type: 'application/json' }), `${meeting?.title || 'meeting'}-whiteboard.json`);
  };

  const updateMyInviteResponse = async (status: InviteResponseStatus) => {
    if (!id || !currentUserInvite) {
      return;
    }

    setInviteResponseStatus('Saving response...');
    try {
      const response = await meetingAPI.updateInviteResponse(id, currentUserInvite.id, {
        status,
        reason: inviteResponseReason,
      });
      setMeetingInvites((items) => items.map((invite) => (
        invite.id === response.data.id ? response.data : invite
      )));
      setInviteResponseStatus(`Response saved as ${response.data.responseStatus}`);
    } catch (err: any) {
      setInviteResponseStatus(getRequestErrorMessage(err, 'Unable to save response'));
    }
  };

  useEffect(() => {
    if (!inviteResponseFromQuery || inviteResponseAppliedRef.current || !id || !user?.email) {
      return;
    }

    if (!currentUserInvite) {
      if (meetingInvites.length > 0) {
        inviteResponseAppliedRef.current = true;
        setInviteResponseStatus('This RSVP link belongs to another invited email. Sign in with the invited account.');
      }
      return;
    }

    if (inviteIdFromQuery && currentUserInvite.id.toLowerCase() !== inviteIdFromQuery.toLowerCase()) {
      inviteResponseAppliedRef.current = true;
      setInviteResponseStatus('This RSVP link belongs to another invite.');
      return;
    }

    inviteResponseAppliedRef.current = true;
    updateMyInviteResponse(inviteResponseFromQuery).finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('response');
      url.searchParams.delete('inviteId');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    });
  }, [currentUserInvite?.id, id, inviteIdFromQuery, inviteResponseFromQuery, meetingInvites.length, user?.email]);

  const callUserIntoMeeting = async (candidate: UserSummary) => {
    if (!id || !meeting || !user || !currentParticipant) {
      return;
    }

    const candidateName = displayKnownUser(candidate);
    const candidateStatus = getUserStatus(candidate.id, candidate.email);
    if (candidateStatus !== 'Available') {
      setInviteStatus(`${candidateName} is ${statusLabel(candidateStatus)}. You can call them when they are available.`);
      return;
    }

    setInviteStatus(`Calling ${candidateName}...`);
    let outgoingCall: OutgoingMeetingCall | null = null;

    try {
      const joinUrl = getMeetingJoinUrl(id, meeting.meetingLink, 'call=video&autojoin=1');
      const callLogResponse = await meetingAPI.createCallLog(id, {
        conversationId: `meeting-${id}`,
        recipientUserId: candidate.id,
        recipientEmail: candidate.email,
        recipientName: candidateName,
        callType: 'video',
        joinUrl,
      });
      const callLogId = callLogResponse.data.id as string;
      outgoingCall = {
        callLogId,
        userId: candidate.id,
        email: candidate.email,
        displayName: candidateName,
        status: 'Ringing',
        sentAt: new Date().toISOString(),
      };
      setInviteCallStatuses((items) => ({
        ...items,
        [candidate.id]: outgoingCall as OutgoingMeetingCall,
      }));
      setInviteSearch('');
      setInviteStatus(`${candidateName} is ringing. Waiting for response...`);
      window.setTimeout(() => {
        const latestCall = inviteCallStatusesRef.current[candidate.id];
        if (!latestCall || latestCall.status !== 'Ringing') {
          return;
        }

        setInviteCallStatuses((items) => {
          const current = items[candidate.id];
          if (!current || current.status !== 'Ringing') {
            return items;
          }

          return {
            ...items,
            [candidate.id]: {
              ...current,
              status: 'No response',
            },
          };
        });
        if (latestCall.callLogId) {
          meetingAPI.updateCallLog(id, latestCall.callLogId, {
            status: 'NoResponse',
            reason: 'No response',
          }).catch(() => undefined);
        }
      }, 45_000);
    } catch (err: any) {
      if (outgoingCall?.callLogId) {
        meetingAPI.updateCallLog(id, outgoingCall.callLogId, {
          status: 'Failed',
          reason: getRequestErrorMessage(err, 'Unable to call user into meeting'),
        }).catch(() => undefined);
      }
      setInviteCallStatuses((items) => ({
        ...items,
        [candidate.id]: {
          callLogId: outgoingCall?.callLogId,
          userId: candidate.id,
          email: candidate.email,
          displayName: candidateName,
          status: 'Failed',
          sentAt: new Date().toISOString(),
        },
      }));
      setInviteStatus(getRequestErrorMessage(err, 'Unable to call user into meeting'));
    }
  };

  const sendCallCancellationChatMessage = async (call: OutgoingMeetingCall) => {
    if (!user) {
      return null;
    }

    try {
      const conversationResponse = await conversationAPI.createConversation({
        type: 'Direct',
        title: null,
        members: [
          {
            userId: user.id,
            userEmail: user.email,
            userName: displayName,
          },
          {
            userId: call.userId,
            userEmail: call.email,
            userName: call.displayName,
          },
        ],
        inviteEmails: [],
      });
      const conversationId = conversationResponse.data.id;
      const messageResponse = await conversationAPI.sendMessage(conversationId, {
        senderId: user.id,
        senderName: displayName,
        message: CALL_CANCEL_MESSAGE,
      });

      return messageResponse.data.id as string;
    } catch (err) {
      console.warn('Unable to save call cancellation message', err);
      return null;
    }
  };

  const cancelOutgoingMeetingCall = async (call: OutgoingMeetingCall) => {
    if (!id || !meeting || !user || call.status !== 'Ringing') {
      return;
    }

    setInviteStatus(`Stopping call to ${call.displayName}...`);

    try {
      setInviteCallStatuses((items) => ({
        ...items,
        [call.userId]: {
          ...call,
          status: 'Cancelled',
        },
      }));

      const cancellationMessageId = await sendCallCancellationChatMessage(call);
      if (call.callLogId) {
        await meetingAPI.updateCallLog(id, call.callLogId, {
          status: 'Cancelled',
          reason: 'Cancelled by caller',
          cancellationMessage: CALL_CANCEL_MESSAGE,
          cancellationMessageId,
        }).catch(() => undefined);
      }
      setInviteStatus(
        cancellationMessageId
          ? `Call stopped. ${call.displayName} received the mistake message.`
          : `Call stopped. ${call.displayName} was notified, but the chat message could not be saved.`,
      );
    } catch (err: any) {
      const cancellationMessageId = await sendCallCancellationChatMessage(call);
      if (call.callLogId) {
        await meetingAPI.updateCallLog(id, call.callLogId, {
          status: 'Cancelled',
          reason: 'Cancelled by caller',
          cancellationMessage: CALL_CANCEL_MESSAGE,
          cancellationMessageId,
        }).catch(() => undefined);
      }
      setInviteCallStatuses((items) => ({
        ...items,
        [call.userId]: {
          ...call,
          status: 'Cancelled',
        },
      }));
      setInviteStatus(
        cancellationMessageId
          ? `${getRequestErrorMessage(err, 'Unable to stop call right now')} Mistake message was sent in chat.`
          : getRequestErrorMessage(err, 'Unable to stop call right now'),
      );
    }
  };

  const copyJoinLink = async () => {
    const link = meeting ? getMeetingJoinUrl(meeting.id, meeting.meetingLink) : window.location.href;

    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Unable to copy');
    }

    window.setTimeout(() => setCopyStatus(''), 2500);
  };

  const updateRole = async (participantId: string, role: string) => {
    if (!id || !isOrganizer) {
      return;
    }

    await meetingAPI.updateParticipantRole(id, participantId, { role });
    await refreshParticipants();
  };

  const muteParticipant = async (participant: Participant) => {
    if (!id || !hasJoined) {
      return;
    }

    if (participant.userId === user?.id || participant.id === currentParticipant?.id) {
      await updateStatus({ audio: false });
      return;
    }

    if (!isOrganizer) {
      return;
    }

    await meetingAPI.updateParticipantStatus(id, participant.id, {
      audioEnabled: false,
      videoEnabled: participant.isVideoEnabled,
      screenSharing: isParticipantPresenting(participant),
    });
    setParticipants((items) => items.map((item) => (
      item.id === participant.id ? { ...item, isAudioEnabled: false } : item
    )));
    await notifyParticipantMediaStatusChanged(
      id,
      participant.userId,
      participant.userName,
      false,
      participant.isVideoEnabled,
      isParticipantPresenting(participant),
    );
    setActivity((items) => [`Muted ${participant.userName}`, ...items].slice(0, 5));
  };

  const decideLobby = async (requestId: string, admit: boolean) => {
    if (!id || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.decideLobbyRequest(id, requestId, { admit });
    await notifyLobbyDecision(
      id,
      response.data.userId,
      response.data.userName,
      admit,
    );
    await refreshLobby();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await roomRef.current?.requestFullscreen();
    } catch {
      setActivity((items) => ['Fullscreen is not available in this browser session.', ...items].slice(0, 5));
    }
  };

  const setClampedSidePanelWidth = (width: number) => {
    setSidePanelWidth(Math.min(640, Math.max(280, Math.round(width))));
  };

  const startSidePanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidePanelWidth;

    resizeCleanupRef.current?.();
    setIsResizingSidePanel(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setClampedSidePanelWidth(startWidth + (startX - moveEvent.clientX));
    };

    const stopResize = () => {
      setIsResizingSidePanel(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = stopResize;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  const handleSidePanelResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setClampedSidePanelWidth(sidePanelWidth + 24);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setClampedSidePanelWidth(sidePanelWidth - 24);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading meeting...</div>;
  }

  if (error || !meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Meeting unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'This meeting could not be found.'}</p>
          <button
            onClick={() => navigate(getOrganizationScopedPath('/dashboard'))}
            className="mt-5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Back to calendar
          </button>
        </div>
      </div>
    );
  }

  const hasJoined = !!currentParticipant;
  const focusedRemoteStream = remoteStreams.find((remote) => remote.userId === focusedRemoteUserId) || null;
  const visibleRemoteStreams = focusedRemoteStream
    ? remoteStreams.filter((remote) => remote.userId !== focusedRemoteStream.userId)
    : remoteStreams;
  const isSidePanelWide = sidePanelWidth >= 460;
  const meetingGridStyle = sidePanelOpen
    ? ({ '--meeting-side-panel-width': `${sidePanelWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div ref={roomRef} className="flex h-screen flex-col overflow-hidden bg-[#050b16] text-white">
      <header className="shrink-0 border-b border-white/10 bg-slate-950/95">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{meeting.title}</h1>
            <p className="truncate text-xs text-slate-300">{formatDateTime(meeting.startTime)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton title={sidePanelOpen ? 'Hide panel' : 'Show panel'} onClick={() => setSidePanelOpen((open) => !open)}>
              <PanelIcon />
            </IconButton>
            <IconButton title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} active={isFullscreen}>
              <FullscreenIcon exit={isFullscreen} />
            </IconButton>
            {!hasJoined && (
              <ProfileStatusMenu
                displayName={displayName}
                currentUserId={user?.id}
                email={user?.email}
                profilePictureUrl={user?.profilePictureUrl}
                status={user?.status}
                accounts={accounts.map((account) => account.user)}
                avatarUploading={avatarUploading}
                onChange={updatePresenceStatus}
                onSwitchAccount={handleSwitchAccount}
                onAddAccount={() => navigate('/login?addAccount=1')}
                onAvatarChange={handleAvatarChange}
                onAvatarRemove={handleAvatarRemove}
                onSignOut={handleSignOut}
                dark
              />
            )}
            <div className="relative">
              <IconButton
                title={hasJoined && isOrganizer ? 'Meeting actions' : hasJoined ? 'Leave' : 'Close'}
                onClick={() => {
                  if (hasJoined && isOrganizer) {
                    setMeetingActionOpen((open) => !open);
                    return;
                  }

                  void handleLeave();
                }}
                danger
              >
                <XIcon />
              </IconButton>
              {meetingActionOpen && hasJoined && isOrganizer && (
                <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-md border border-white/10 bg-slate-900 text-sm shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingActionOpen(false);
                      void handleLeave();
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-slate-100 hover:bg-white/10"
                  >
                    Leave meeting
                    <span className="text-xs text-slate-400">Only you</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMeetingActionOpen(false);
                      void handleEndMeeting();
                    }}
                    disabled={endingMeeting}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {endingMeeting ? 'Ending...' : 'End meeting'}
                    <span className="text-xs text-red-300">Everyone</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className={`grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden p-3 ${
          sidePanelOpen ? 'md:grid-cols-[minmax(0,1fr)_10px_var(--meeting-side-panel-width)]' : ''
        } ${isResizingSidePanel ? 'select-none' : ''}`}
        style={meetingGridStyle}
      >
        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-white/10 bg-slate-900/80">
          <div className="relative m-3 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-slate-950">
            {hasJoined ? (
              <div className="relative flex h-full w-full flex-col gap-3">
                {raisedHandParticipants.length > 0 && (
                  <div
                    role="status"
                    aria-live="polite"
                    tabIndex={0}
                    aria-label={`${raisedHandCount} raised ${raisedHandCount === 1 ? 'hand' : 'hands'}`}
                    className="group pointer-events-auto absolute left-4 top-4 z-30 w-fit max-w-[calc(100%-2rem)] overflow-hidden rounded-full border border-amber-300/40 bg-slate-950/85 px-3 py-2 text-amber-50 shadow-xl shadow-black/40 backdrop-blur transition-all duration-150 hover:w-72 hover:rounded-md focus:w-72 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                        <HandRaisedIcon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-200">Raised hand</span>
                        <span className="block truncate text-sm font-semibold text-white">{raisedHandSummary}</span>
                      </span>
                    </div>
                    <div className="hidden border-t border-amber-300/20 pt-2 group-hover:mt-2 group-hover:block group-focus:mt-2 group-focus:block">
                      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                        {raisedHandParticipants.map((participant) => {
                          const isCurrentRaisedParticipant = participant.userId === user?.id || participant.id === currentParticipant?.id;
                          return (
                            <div key={participant.id} className="flex min-w-0 items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                              <UserAvatar
                                displayName={participant.userName}
                                email={participant.userEmail}
                                profilePictureUrl={getUserAvatar(participant.userId, participant.userEmail)}
                                status={getParticipantPresenceStatus(participant)}
                                showStatus
                                size="sm"
                                dark
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-white">
                                  {isCurrentRaisedParticipant ? 'You' : participant.userName}
                                </span>
                                <LivePresenceIndicator
                                  label={getParticipantPresenceLabel(participant)}
                                  kind={getParticipantPresenceKind(participant)}
                                  compact
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {focusedRemoteStream ? (
                  <RemoteVideoTile remote={focusedRemoteStream} />
                ) : (
                  <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-slate-950">
                    {screenStream ? (
                      <video ref={screenVideoRef} autoPlay playsInline muted className="h-full max-h-full w-full object-contain" />
                    ) : localStream && videoEnabled ? (
                      <video ref={videoRef} autoPlay playsInline muted className="h-full max-h-full w-full object-contain" />
                    ) : (
                      <UserAvatar
                        displayName={displayName}
                        email={user?.email}
                        profilePictureUrl={user?.profilePictureUrl}
                        size="xl"
                        dark
                      />
                    )}
                    <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                      You {audioEnabled ? '' : '(muted)'} {screenSharing ? '- presenting' : ''}
                    </div>
                  </div>
                )}
                {visibleRemoteStreams.length > 0 && (
                  <div className="grid max-h-44 shrink-0 gap-3 overflow-y-auto md:grid-cols-3">
                    {visibleRemoteStreams.map((remote) => (
                      <button
                        key={remote.userId}
                        onClick={() => setFocusedRemoteUserId(remote.userId)}
                        className="block text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <RemoteVideoTile remote={remote} />
                      </button>
                    ))}
                  </div>
                )}
                {remoteStreams.length === 0 && (
                  <div className="absolute right-8 top-8 rounded-md bg-black/40 px-3 py-2 text-sm text-slate-200">
                    Waiting for others to join
                  </div>
                )}
                {floatingReactions.length > 0 && (
                  <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex max-w-xs flex-col items-end gap-2">
                    {floatingReactions.map((item) => (
                      <div key={item.id} className="rounded-full bg-black/60 px-3 py-2 text-2xl shadow-lg">
                        <span aria-hidden="true">{item.reaction}</span>
                        <span className="ml-2 align-middle text-xs font-semibold text-white">{item.userName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md text-center">
                <h2 className="text-2xl font-semibold">{canJoinMeeting ? 'Ready to join?' : 'Meeting has ended'}</h2>
                <p className="mt-2 text-slate-300">
                  {canJoinMeeting ? meeting.description || 'Join when you are ready.' : 'Live joining is closed, but meeting chat and recordings remain available.'}
                </p>
                <button
                  onClick={handleJoin}
                  disabled={!canJoinMeeting || joining || waitingForLobby}
                  className="mt-6 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {!canJoinMeeting ? 'Closed' : joining ? 'Joining...' : waitingForLobby ? 'Waiting for organizer' : lobbyAdmitted ? 'Join admitted meeting' : 'Join now'}
                </button>
                {waitingForLobby && (
                  <p className="mt-3 text-sm text-amber-200">The organizer has your lobby request.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950/75 px-3 py-3">
            <IconButton
              title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              disabled={!hasJoined}
              onClick={() => updateStatus({ audio: !audioEnabled })}
              danger={!audioEnabled}
            >
              <MicIcon off={!audioEnabled} />
            </IconButton>
            <IconButton
              title={videoEnabled ? 'Stop video' : 'Start video'}
              disabled={!hasJoined}
              onClick={() => updateStatus({ video: !videoEnabled })}
              danger={!videoEnabled}
            >
              <VideoIcon off={!videoEnabled} />
            </IconButton>
            <IconButton
              title={screenSharing ? 'Stop sharing' : 'Share screen'}
              disabled={!hasJoined}
              onClick={() => updateStatus({ sharing: !screenSharing })}
              active={screenSharing}
            >
              <ScreenIcon />
            </IconButton>
            <IconButton
              title={currentParticipant?.isHandRaised ? 'Lower hand' : 'Raise hand'}
              disabled={!hasJoined}
              onClick={updateHandRaised}
              active={currentParticipant?.isHandRaised}
            >
              <HandRaisedIcon />
            </IconButton>
            {meeting.allowReactions && (
              <div className="flex h-9 items-center gap-1 rounded-md border border-white/10 bg-slate-800 px-1">
                {QUICK_REACTIONS.map((reaction) => (
                  <button
                    key={reaction}
                    type="button"
                    title={`React ${reaction}`}
                    aria-label={`React ${reaction}`}
                    disabled={!hasJoined}
                    onClick={() => sendQuickReaction(reaction)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-base transition hover:bg-white/10 disabled:opacity-40"
                  >
                    {reaction}
                  </button>
                ))}
              </div>
            )}
            {isOrganizer && (
              meeting.allowRecording ? (
                <button
                  type="button"
                  title={isRecording ? 'Stop recording' : 'Start recording'}
                  aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                  disabled={!hasJoined || recordingStatus === 'Saving recording...' || recordingStatus === 'Preparing recording...' || recordingStatus === 'Stopping recording...'}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-semibold disabled:opacity-40 ${
                    isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  <RecordIcon active={isRecording} />
                  {isRecording && <span className="text-xs">{formatDuration(recordingSeconds)}</span>}
                </button>
              ) : (
                <IconButton
                  title="Enable recording"
                  disabled={!hasJoined}
                  onClick={enableRecording}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <RecordIcon />
                </IconButton>
              )
            )}
          </div>
          {recordingStatus && (
            <p className={`px-3 pb-3 text-center text-sm ${isRecording ? 'text-red-200' : 'text-slate-300'}`}>
              {recordingStatus}
            </p>
          )}
        </section>

        {sidePanelOpen && (
          <div
            role="separator"
            aria-label="Resize video and side panel"
            aria-orientation="vertical"
            aria-valuemin={280}
            aria-valuemax={640}
            aria-valuenow={sidePanelWidth}
            tabIndex={0}
            title="Drag to resize video area"
            onPointerDown={startSidePanelResize}
            onKeyDown={handleSidePanelResizeKey}
            className={`group hidden cursor-col-resize touch-none items-center justify-center rounded-md border border-white/10 bg-slate-950/70 outline-none transition hover:bg-slate-800 focus:ring-2 focus:ring-blue-400 md:flex ${
              isResizingSidePanel ? 'bg-slate-800 ring-2 ring-blue-400' : ''
            }`}
          >
            <span className="h-16 w-1 rounded-full bg-slate-600 transition group-hover:bg-blue-400" />
          </div>
        )}

        <aside className={`${sidePanelOpen ? 'flex' : 'hidden'} min-h-0 flex-col gap-3 overflow-y-auto rounded-md border border-white/10 bg-slate-950/80 p-3`}>
          <div className="sticky top-0 z-20 rounded-md border border-white/10 bg-slate-950/95 p-2 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-4 gap-1">
                {([
                  ['participants', 'People', <PeopleIcon key="people" />, participants.length],
                  ['chat', 'Chat', <ChatIcon key="chat" />, chatMessages.length],
                  ['whiteboard', 'Board', <NotesIcon key="board" />, whiteboardItems.length],
                  ['details', 'Details', <InfoIcon key="details" />, 0],
                ] as Array<[SidePanelTab, string, ReactNode, number]>).map(([tab, label, icon, count]) => (
                  <button
                    key={tab}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => setActiveSidePanelTab(tab)}
                    className={`relative flex h-9 items-center justify-center rounded-md px-2 text-xs font-semibold ${
                      activeSidePanelTab === tab
                        ? 'bg-white text-slate-950'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {icon}
                    {count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-bold text-white">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <IconButton
                onClick={() => setClampedSidePanelWidth(isSidePanelWide ? 340 : 500)}
                title={isSidePanelWide ? 'Use compact panel' : 'Use wide panel'}
                active={isSidePanelWide}
                className="h-9 w-9"
              >
                <PinIcon />
              </IconButton>
            </div>
          </div>

          <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-3`}>
            <h2 className="text-base font-semibold">Meeting details</h2>
            <div className="mt-3 space-y-1.5 text-sm text-slate-300">
              <p>{meeting.isOnlineMeeting ? 'Online meeting' : 'In-person meeting'}</p>
              {meeting.location && <p>{meeting.location}</p>}
              <p>{meeting.durationMinutes || 60} minutes</p>
              <p>Lobby {meeting.lobbyEnabled ? 'enabled' : 'disabled'}</p>
              <p>{meeting.allowRecording ? 'Recording allowed' : 'Recording unavailable'} - {meeting.allowTranscription ? 'Transcription allowed' : 'Transcription unavailable'}</p>
              {meeting.recordingUrl && (
                <a
                  href={resolveRecordingUrl(meeting.recordingUrl)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open recording"
                  aria-label="Open recording"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                >
                  <RecordIcon />
                </a>
              )}
              {meeting.meetingLink && (
                <div className="flex flex-wrap items-center gap-2">
                  <IconButton title={copyStatus === 'Copied' ? 'Link copied' : 'Copy join link'} onClick={copyJoinLink}>
                    <LinkIcon />
                  </IconButton>
                  {copyStatus && (
                    <span
                      aria-live="polite"
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        copyStatus === 'Copied' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'
                      }`}
                    >
                      {copyStatus}
                    </span>
                  )}
                </div>
              )}
              {isOrganizer && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <IconButton title="Export meeting chat" onClick={exportMeetingChat}>
                    <ChatIcon />
                  </IconButton>
                  <IconButton title="Export whiteboard data" onClick={exportMeetingWhiteboardJson}>
                    <NotesIcon />
                  </IconButton>
                </div>
              )}
            </div>
          </section>

          {currentUserInvite && (
            <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">My response</h2>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${inviteResponseClass(currentUserInvite.responseStatus)}`}>
                  {currentUserInvite.responseStatus}
                </span>
              </div>
              <textarea
                value={inviteResponseReason}
                onChange={(event) => setInviteResponseReason(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Optional reason"
                className="mt-3 w-full resize-none rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['Accepted', 'Tentative', 'Declined'] as InviteResponseStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateMyInviteResponse(status)}
                    disabled={inviteResponseStatus === 'Saving response...'}
                    className={`rounded-md px-2 py-2 text-xs font-semibold disabled:opacity-50 ${inviteResponseClass(status)}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {inviteResponseStatus && <p className="mt-2 text-xs text-slate-300">{inviteResponseStatus}</p>}
            </section>
          )}

          {isOrganizer && meetingInvites.length > 0 && (
            <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
              <h2 className="text-base font-semibold">Invite responses</h2>
              <div className="mt-3 space-y-2">
                {meetingInvites.map((invite) => (
                  <div key={invite.id} className="rounded-md bg-slate-800 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{invite.displayName || invite.email}</span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${inviteResponseClass(invite.responseStatus)}`}>
                        {invite.responseStatus}
                      </span>
                    </div>
                    {invite.displayName && <p className="mt-1 truncate text-xs text-slate-500">{invite.email}</p>}
                    {invite.responseReason && <p className="mt-1 text-xs text-slate-300">{invite.responseReason}</p>}
                    {invite.respondedAt && <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(invite.respondedAt)}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={`${activeSidePanelTab === 'participants' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Participants</h2>
                {raisedHandCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-amber-200">
                    {raisedHandCount === 1 ? '1 raised hand is at the top' : `${raisedHandCount} raised hands are at the top`}
                  </p>
                )}
              </div>
              <IconButton title="Refresh participants" onClick={refreshParticipants} className="h-8 w-8">
                <RefreshIcon />
              </IconButton>
            </div>
            {hasJoined && (
              <div className="mt-3 rounded-md border border-white/10 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Call people</p>
                    <p className="text-xs text-slate-400">Search available users and ring them directly.</p>
                  </div>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-800 text-slate-200">
                    <VideoIcon />
                  </span>
                </div>
                <input
                  value={inviteSearch}
                  onChange={(event) => setInviteSearch(event.target.value)}
                  placeholder="Search available users"
                  className="mt-3 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                />
                {inviteSearch.trim() && (
                  <div className="mt-2 space-y-1">
                    {searchableInviteUsers.length === 0 ? (
                      <p className="rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-400">No matching users found.</p>
                    ) : (
                      searchableInviteUsers.map((candidate) => {
                        const candidateStatus = getUserStatus(candidate.id, candidate.email);
                        const canCallCandidate = candidateStatus === 'Available';

                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => void callUserIntoMeeting(candidate)}
                            disabled={!canCallCandidate}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                              canCallCandidate
                                ? 'bg-slate-900 hover:bg-slate-800'
                                : 'cursor-not-allowed bg-slate-900/60 opacity-60'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <UserAvatar
                                displayName={displayKnownUser(candidate)}
                                email={candidate.email}
                                profilePictureUrl={candidate.profilePictureUrl}
                                status={candidateStatus}
                                showStatus
                                size="sm"
                                dark
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-white">{displayKnownUser(candidate)}</span>
                                <span className="block truncate text-xs text-slate-400">{candidate.email}</span>
                                <span className={`mt-0.5 block text-[11px] font-semibold ${
                                  canCallCandidate ? 'text-emerald-200' : 'text-slate-500'
                                }`}>
                                  {statusLabel(candidateStatus)}
                                </span>
                              </span>
                            </span>
                            <span className={`shrink-0 ${canCallCandidate ? 'text-emerald-200' : 'text-slate-500'}`}>
                              <VideoIcon />
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {inviteStatus && <p className="mt-2 text-xs text-slate-300">{inviteStatus}</p>}
                {Object.values(inviteCallStatuses).length > 0 && (
                  <div className="mt-3 space-y-1">
                    {Object.values(inviteCallStatuses).map((call) => (
                      <div key={call.userId} className="flex items-center justify-between gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-100">{call.displayName}</span>
                          <span className="block truncate text-slate-500">{call.email}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className={`rounded-full px-2 py-1 font-semibold ${
                            call.status === 'Joined' || call.status === 'Accepted'
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : call.status === 'No response' || call.status === 'Failed' || call.status === 'Declined'
                                ? 'bg-red-500/15 text-red-200'
                                : call.status === 'Cancelled'
                                  ? 'bg-slate-700 text-slate-200'
                                  : 'bg-amber-500/15 text-amber-200'
                          }`}>
                            {call.status}
                          </span>
                          {call.status === 'Ringing' && (
                            <button
                              type="button"
                              onClick={() => void cancelOutgoingMeetingCall(call)}
                              title={`Stop call to ${call.displayName}`}
                              aria-label={`Stop call to ${call.displayName}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 bg-red-500/15 text-red-200 transition hover:bg-red-500/25"
                            >
                              <XIcon />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 space-y-2">
              {participants.length === 0 ? (
                <p className="text-sm text-slate-400">No one has joined yet.</p>
              ) : (
                sortedParticipants.map((participant) => {
                  const isCurrentUserParticipant = participant.userId === user?.id || participant.id === currentParticipant?.id;
                  return (
                  <div
                    key={participant.id}
                    className={`rounded-md border px-3 py-3 transition ${
                      participant.isHandRaised
                        ? 'border-amber-400/40 bg-amber-500/10 shadow-sm shadow-amber-950/30'
                        : 'border-transparent bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <UserAvatar
                          displayName={participant.userName}
                          email={participant.userEmail}
                          profilePictureUrl={getUserAvatar(participant.userId, participant.userEmail)}
                          status={getParticipantPresenceStatus(participant)}
                          showStatus
                          size="sm"
                          dark
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{participant.userName}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <LivePresenceIndicator
                              label={getParticipantPresenceLabel(participant)}
                              kind={getParticipantPresenceKind(participant)}
                            />
                            {participant.role && (
                              <span className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                                {participant.role}
                              </span>
                            )}
                            {participant.isHandRaised && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                <HandRaisedIcon className="h-3 w-3" />
                                Hand raised
                              </span>
                            )}
                            {participant.reaction && (
                              <span className="rounded bg-slate-950 px-1.5 py-0.5 text-sm" aria-label="Latest reaction">
                                {participant.reaction}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isOrganizer && participant.userId !== user?.id && (
                          <select
                            value={participant.role || 'Attendee'}
                            onChange={(event) => updateRole(participant.id, event.target.value)}
                            className="max-w-[96px] rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
                          >
                            <option value="Attendee">Attendee</option>
                            <option value="Presenter">Presenter</option>
                            <option value="Organizer">Organizer</option>
                          </select>
                        )}
                        {(isOrganizer || isCurrentUserParticipant) && (
                          <IconButton
                            title={isCurrentUserParticipant ? 'Mute me' : 'Mute participant'}
                            onClick={() => muteParticipant(participant)}
                            disabled={!participant.isAudioEnabled}
                            danger
                            className="h-8 w-8"
                          >
                            <MicIcon off />
                          </IconButton>
                        )}
                        {!isCurrentUserParticipant && (
                          <IconButton
                            title={`Chat with ${participant.userName}`}
                            onClick={() => {
                              setChatRecipient(participant.userId);
                              setActiveSidePanelTab('chat');
                            }}
                            disabled={!participant.userId}
                            className="h-8 w-8"
                          >
                            <ChatIcon />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </section>

          {isOrganizer && (
            <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Lobby</h2>
                <IconButton title="Refresh lobby" onClick={refreshLobby} className="h-8 w-8">
                  <RefreshIcon />
                </IconButton>
              </div>
              <div className="mt-3 space-y-2">
                {lobbyRequests.filter((request) => request.status === 'Waiting').length === 0 ? (
                  <p className="text-sm text-slate-400">No one is waiting.</p>
                ) : (
                  lobbyRequests
                    .filter((request) => request.status === 'Waiting')
                    .map((request) => (
                      <div key={request.id} className="rounded-md bg-slate-800 px-3 py-2">
                        <p className="text-sm font-medium">{request.userName}</p>
                        <p className="text-xs text-slate-400">{request.userEmail}</p>
                        <div className="mt-2 flex gap-2">
                          <IconButton
                            title="Admit"
                            onClick={() => decideLobby(request.id, true)}
                            className="h-8 w-8 border-emerald-500/30 bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <CheckIcon />
                          </IconButton>
                          <IconButton
                            title="Deny"
                            onClick={() => decideLobby(request.id, false)}
                            danger
                            className="h-8 w-8"
                          >
                            <XIcon />
                          </IconButton>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          )}

          <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
            <h2 className="text-base font-semibold">Meeting notes</h2>
            <textarea
              value={meetingNotes}
              onChange={(event) => setMeetingNotes(event.target.value)}
              disabled={!isOrganizer}
              rows={5}
              placeholder="Capture decisions, follow-ups, and recap notes"
              className="mt-3 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
            />
            {isOrganizer && (
              <button
                onClick={saveNotes}
                title="Save notes"
                aria-label="Save notes"
                className="mt-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                <NotesIcon />
              </button>
            )}
          </section>

          <section className={`${activeSidePanelTab === 'whiteboard' ? 'flex' : 'hidden'} min-h-[620px] flex-col rounded-md border border-white/10 bg-slate-900 p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">Whiteboard</h2>
                <p className="text-xs text-slate-400">{canEditWhiteboard ? 'Shared with everyone in this meeting.' : 'View only. Ask the organizer for presenter access.'}</p>
              </div>
              {whiteboardStatus && <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{whiteboardStatus}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(['pen', 'eraser', 'text'] as const).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => setWhiteboardTool(tool)}
                  disabled={!canEditWhiteboard}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize disabled:opacity-50 ${whiteboardTool === tool ? 'bg-white text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-white/10'}`}
                >
                  {tool}
                </button>
              ))}
              <input
                type="color"
                value={whiteboardColor}
                onChange={(event) => setWhiteboardColor(event.target.value)}
                disabled={!canEditWhiteboard || whiteboardTool === 'eraser'}
                className="h-8 w-10 rounded border border-white/10 bg-slate-800 p-1 disabled:opacity-50"
                aria-label="Whiteboard color"
              />
              <input
                type="range"
                min={2}
                max={12}
                value={whiteboardSize}
                onChange={(event) => setWhiteboardSize(Number(event.target.value))}
                disabled={!canEditWhiteboard}
                className="w-24"
                aria-label="Whiteboard stroke size"
              />
              <IconButton title="Undo" onClick={undoWhiteboard} disabled={!canEditWhiteboard || whiteboardItems.length === 0} className="h-8 w-8">
                <UndoIcon />
              </IconButton>
              <IconButton title="Redo" onClick={redoWhiteboard} disabled={!canEditWhiteboard || whiteboardRedoItems.length === 0} className="h-8 w-8">
                <RedoIcon />
              </IconButton>
              <IconButton title="Clear whiteboard" onClick={clearWhiteboard} disabled={!canEditWhiteboard || whiteboardItems.length === 0} danger className="h-8 w-8">
                <XIcon />
              </IconButton>
            </div>
            {whiteboardTool === 'text' && (
              <div className="mt-3 flex gap-2">
                <input
                  value={whiteboardText}
                  onChange={(event) => setWhiteboardText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addWhiteboardText();
                    }
                  }}
                  disabled={!canEditWhiteboard}
                  placeholder="Text to place on board"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
                />
                <IconButton title="Add text" onClick={addWhiteboardText} disabled={!canEditWhiteboard || !whiteboardText.trim()} className="h-10 w-10 border-blue-500/30 bg-blue-600 hover:bg-blue-700">
                  <SendIcon />
                </IconButton>
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md bg-white p-2">
              <canvas
                ref={whiteboardCanvasRef}
                width={900}
                height={560}
                onPointerDown={startWhiteboardDraw}
                onPointerMove={moveWhiteboardDraw}
                onPointerUp={finishWhiteboardDraw}
                onPointerCancel={finishWhiteboardDraw}
                className={`h-auto w-full rounded border border-slate-200 bg-white ${canEditWhiteboard && whiteboardTool !== 'text' ? 'cursor-crosshair' : 'cursor-default'}`}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={exportWhiteboardImage} className="rounded-md bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10">
                PNG
              </button>
              <button type="button" onClick={exportWhiteboardPdf} className="rounded-md bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10">
                PDF
              </button>
              {isOrganizer && (
                <button type="button" onClick={exportMeetingWhiteboardJson} className="rounded-md bg-slate-800 px-2 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10">
                  Data
                </button>
              )}
            </div>
          </section>

          <section
            className={`${activeSidePanelTab === 'chat' ? 'relative flex min-h-[560px] flex-1 flex-col' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}
            onDragOver={handleMeetingChatDragOver}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDraggingMeetingImage(false);
              }
            }}
            onDrop={handleMeetingChatDrop}
          >
            {isDraggingMeetingImage && (
              <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-md border border-dashed border-blue-300 bg-blue-500/10 text-sm font-semibold text-blue-100">
                Drop screenshot here
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Chat</h2>
              <select
                value={chatRecipient}
                onChange={(event) => setChatRecipient(event.target.value)}
                disabled={!hasJoined}
                className="max-w-[170px] rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white outline-none disabled:opacity-50"
              >
                <option value="everyone">Everyone</option>
                {sortedParticipants
                  .filter((participant) => participant.userId && participant.userId !== user?.id)
                  .map((participant) => (
                    <option key={participant.id} value={participant.userId}>
                      {participant.userName}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-3 flex min-h-[360px] flex-1 flex-col gap-2 overflow-y-auto rounded-md bg-slate-950 p-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-slate-400">No messages yet.</p>
              ) : (
                chatMessages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  return (
                    <div key={message.id} className={`max-w-[90%] rounded-md px-3 py-2 text-sm ${isMine ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs opacity-80">
                        <span>{isMine ? 'You' : message.senderName}</span>
                        <span>{message.scope === 'direct' ? `Direct${message.recipientName ? ` to ${message.recipientName}` : ''}` : 'Everyone'}</span>
                      </div>
                      {renderChatMessageText(message.message, isMine)}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {pendingMeetingImages.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {pendingMeetingImages.map((image) => (
                  <div key={image.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950 p-2">
                    <img src={image.dataUrl} alt={image.name} className="h-12 w-16 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-100">{image.name}</p>
                      <p className="text-[11px] text-slate-500">{formatFileSize(image.size)}</p>
                    </div>
                    <IconButton
                      title="Remove screenshot"
                      onClick={() => removePendingMeetingImage(image.id)}
                      className="h-8 w-8"
                    >
                      <XIcon />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-end gap-2">
              <textarea
                ref={chatInputRef}
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onPaste={handleMeetingChatPaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendChat().finally(() => {
                      window.requestAnimationFrame(() => chatInputRef.current?.focus());
                    });
                    return;
                  }

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const nextDraft = `${chatDraft.slice(0, start)}  ${chatDraft.slice(end)}`;
                    setChatDraft(nextDraft);
                    window.requestAnimationFrame(() => {
                      target.selectionStart = start + 2;
                      target.selectionEnd = start + 2;
                    });
                  }
                }}
                rows={Math.min(5, Math.max(2, chatDraft.split('\n').length))}
                disabled={!hasJoined}
                placeholder={hasJoined ? 'Type a message' : 'Join to chat'}
                className="max-h-32 min-w-0 flex-1 resize-none rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
              />
              <IconButton
                title="Send message"
                onClick={() => {
                  handleSendChat().finally(() => {
                    window.requestAnimationFrame(() => chatInputRef.current?.focus());
                  });
                }}
                disabled={!hasJoined || (!chatDraft.trim() && pendingMeetingImages.length === 0)}
                className="h-10 w-10 shrink-0 border-blue-500/30 bg-blue-600 text-white hover:bg-blue-700"
              >
                <SendIcon />
              </IconButton>
            </div>
          </section>

          <section className={`${activeSidePanelTab === 'details' ? 'block' : 'hidden'} rounded-md border border-white/10 bg-slate-900 p-4`}>
            <h2 className="text-base font-semibold">Activity</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {activity.length === 0 ? <p className="text-slate-400">Activity will appear here.</p> : activity.map((item, index) => <p key={index}>{item}</p>)}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
