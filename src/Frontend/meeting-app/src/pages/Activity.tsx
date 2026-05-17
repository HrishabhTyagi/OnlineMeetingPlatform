import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuthStore } from '../store/authStore';
import {
  conversationAPI,
  getActiveOrganization,
  getOrganizationScopedPath,
  meetingAPI,
  organizationAPI,
  resolveApiAssetUrl,
  type ActiveOrganization,
} from '../services/api';
import {
  clearStoredMissedCall,
  clearStoredMissedCalls,
  readStoredMissedCalls,
  type StoredMissedCall,
} from '../services/activityFeed';

interface ConversationMember {
  userId: string;
  userEmail: string;
  userName: string;
}

interface ConversationInvite {
  id: string;
  email: string;
  hasAccepted: boolean;
  createdAt: string;
}

interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  message: string;
  attachmentFileName?: string;
  sentAt: string;
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

interface Meeting {
  id: string;
  organizerId: string;
  title: string;
  startTime: string;
  endTime?: string;
  attendeeEmails?: string[];
  meetingLink?: string;
  recordingUrl?: string;
  status: string;
  createdAt: string;
}

interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  localAppUrl?: string;
  storageProvider?: string;
  storageRootPath?: string;
  publicBaseUrl?: string;
  maxRecordingMegabytes?: number;
  maxAttachmentMegabytes?: number;
  allowExternalGuests?: boolean;
}

type FeedTone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate' | 'violet';

interface ActivityItem {
  id: string;
  type: string;
  tone: FeedTone;
  title: string;
  detail: string;
  time?: string;
  metric?: string;
  actionLabel?: string;
  action?: () => void;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S';
}

function formatDateTime(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function previewMessage(message?: ConversationMessage) {
  if (!message) {
    return 'No messages yet';
  }

  if (message.message?.trim()) {
    return message.message.trim();
  }

  return message.attachmentFileName ? `Shared ${message.attachmentFileName}` : 'Sent a message';
}

function getConversationName(conversation: Conversation, currentUserId?: string) {
  if (conversation.type === 'Group') {
    return conversation.title || 'Group chat';
  }

  const otherMember = conversation.members.find((member) => member.userId !== currentUserId);
  return otherMember?.userName || otherMember?.userEmail || conversation.title || 'Direct chat';
}

function toneClasses(tone: FeedTone) {
  const map: Record<FeedTone, string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
    violet: 'bg-violet-100 text-violet-700',
  };

  return map[tone];
}

export default function Activity() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [activeOrganization, setActiveOrganization] = useState<ActiveOrganization | null>(() => getActiveOrganization());
  const [organizationSettings, setOrganizationSettings] = useState<OrganizationSettings | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [myMeetings, setMyMeetings] = useState<Meeting[]>([]);
  const [missedCalls, setMissedCalls] = useState<StoredMissedCall[]>(() => readStoredMissedCalls(user?.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const scopedPath = useCallback((path: string) => getOrganizationScopedPath(path, activeOrganization), [activeOrganization]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setActiveOrganization(getActiveOrganization());
    setMissedCalls(readStoredMissedCalls(user?.id));

    try {
      const [conversationResponse, upcomingResponse, myMeetingsResponse, organizationResponse] = await Promise.allSettled([
        conversationAPI.getConversations(),
        meetingAPI.getUpcomingMeetings(),
        meetingAPI.getMyMeetings(),
        organizationAPI.getCurrent(),
      ]);

      if (conversationResponse.status === 'fulfilled') {
        setConversations(conversationResponse.value.data || []);
      }

      if (upcomingResponse.status === 'fulfilled') {
        setUpcomingMeetings(upcomingResponse.value.data || []);
      }

      if (myMeetingsResponse.status === 'fulfilled') {
        setMyMeetings(myMeetingsResponse.value.data || []);
      }

      if (organizationResponse.status === 'fulfilled') {
        setOrganizationSettings(organizationResponse.value.data);
      }

      const failed = [conversationResponse, upcomingResponse, myMeetingsResponse, organizationResponse]
        .some((response) => response.status === 'rejected');
      if (failed) {
        setError('Some activity could not be loaded. Check that all Samvaad services are running.');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const sync = () => {
      setActiveOrganization(getActiveOrganization());
      setMissedCalls(readStoredMissedCalls(user?.id));
    };

    window.addEventListener('samvaad-activity-changed', sync);
    window.addEventListener('samvaad-organization-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('samvaad-activity-changed', sync);
      window.removeEventListener('samvaad-organization-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [user?.id]);

  const feedItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    const userEmail = user?.email?.toLowerCase();

    missedCalls.forEach((call) => {
      items.push({
        id: `missed-${call.meetingId}`,
        type: call.callType === 'video' ? 'Missed video call' : 'Missed call',
        tone: 'rose',
        title: call.callerName,
        detail: `You missed a ${call.callType === 'video' ? 'video call' : 'call'}.`,
        time: call.missedAt,
        actionLabel: 'Open chat',
        action: () => navigate(scopedPath(`/chat?conversationId=${call.conversationId}`)),
      });
    });

    conversations
      .filter((conversation) => (conversation.unreadCount || 0) > 0)
      .forEach((conversation) => {
        const unreadCount = conversation.unreadCount || 0;
        items.push({
          id: `unread-${conversation.id}`,
          type: 'Unread message',
          tone: 'indigo',
          title: getConversationName(conversation, user?.id),
          detail: previewMessage(conversation.lastMessage),
          metric: unreadCount > 99 ? '99+' : unreadCount.toString(),
          time: conversation.lastMessage?.sentAt || conversation.updatedAt || conversation.createdAt,
          actionLabel: 'Open chat',
          action: () => navigate(scopedPath(`/chat?conversationId=${conversation.id}`)),
        });
      });

    conversations
      .flatMap((conversation) => (conversation.invites || [])
        .filter((invite) => !invite.hasAccepted)
        .map((invite) => ({ conversation, invite })))
      .forEach(({ conversation, invite }) => {
        items.push({
          id: `invite-${conversation.id}-${invite.id}`,
          type: 'Pending chat invite',
          tone: 'amber',
          title: invite.email,
          detail: `${getConversationName(conversation, user?.id)} is waiting for this person to join.`,
          time: invite.createdAt,
          actionLabel: 'Open chat',
          action: () => navigate(scopedPath(`/chat?conversationId=${conversation.id}`)),
        });
      });

    upcomingMeetings
      .filter((meeting) => (
        meeting.organizerId === user?.id ||
        !userEmail ||
        (meeting.attendeeEmails || []).some((email) => email.toLowerCase() === userEmail)
      ))
      .slice()
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
      .slice(0, 6)
      .forEach((meeting) => {
        const startsAt = new Date(meeting.startTime);
        const minutesUntil = Math.round((startsAt.getTime() - Date.now()) / 60000);
        const soon = minutesUntil >= 0 && minutesUntil <= 60;
        items.push({
          id: `meeting-${meeting.id}`,
          type: soon ? 'Meeting soon' : 'Upcoming meeting',
          tone: soon ? 'amber' : 'emerald',
          title: meeting.title,
          detail: formatDateTime(meeting.startTime),
          time: meeting.startTime,
          actionLabel: 'Join',
          action: () => navigate(scopedPath(`/meeting/${meeting.id}`)),
        });
      });

    myMeetings
      .filter((meeting) => meeting.recordingUrl)
      .slice()
      .sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime())
      .slice(0, 5)
      .forEach((meeting) => {
        items.push({
          id: `recording-${meeting.id}`,
          type: 'Recording ready',
          tone: 'violet',
          title: meeting.title,
          detail: 'Meeting recording is available.',
          time: meeting.startTime,
          actionLabel: 'Open recording',
          action: () => window.open(resolveApiAssetUrl(meeting.recordingUrl), '_blank', 'noopener,noreferrer'),
        });
      });

    if (activeOrganization) {
      items.push({
        id: `organization-${activeOrganization.id}`,
        type: 'Organization workspace',
        tone: 'slate',
        title: activeOrganization.name,
        detail: `Tenant scope is active at /org/${activeOrganization.slug}.`,
        actionLabel: 'Open workspace',
        action: () => navigate(scopedPath('/dashboard')),
      });
    } else {
      items.push({
        id: 'organization-missing',
        type: 'Organization workspace',
        tone: 'amber',
        title: 'No hosted organization selected',
        detail: 'Open Samvaad from an organization URL to scope meetings, chats, files, and recordings.',
        actionLabel: 'Go to calendar',
        action: () => navigate('/dashboard'),
      });
    }

    return items.sort((left, right) => new Date(right.time || 0).getTime() - new Date(left.time || 0).getTime());
  }, [activeOrganization, conversations, missedCalls, myMeetings, navigate, scopedPath, upcomingMeetings, user?.email, user?.id]);

  const unreadTotal = conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0);
  const pendingInviteCount = conversations.reduce((total, conversation) => (
    total + (conversation.invites || []).filter((invite) => !invite.hasAccepted).length
  ), 0);
  const recordingCount = myMeetings.filter((meeting) => meeting.recordingUrl).length;

  return (
    <AppShell
      active="activity"
      title="Activity"
      subtitle="Samvaad"
      actions={(
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      )}
    >
      <div className="h-full overflow-y-auto bg-slate-100 px-6 py-5">
        <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">Feed</h2>
              <p className="mt-1 text-sm text-slate-500">Messages, calls, meetings, recordings, and workspace alerts in one place.</p>
            </div>

            {error && (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
                {error}
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {loading && feedItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">Loading activity...</div>
              ) : feedItems.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">No activity yet.</div>
              ) : (
                feedItems.map((item) => (
                  <div key={item.id} className="flex gap-4 px-5 py-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-bold ${toneClasses(item.tone)}`}>
                      {item.metric || initials(item.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.type}</span>
                        {item.time && <span className="text-xs text-slate-400">{formatDateTime(item.time)}</span>}
                      </div>
                      <h3 className="mt-1 truncate text-base font-semibold text-slate-950">{item.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.detail}</p>
                    </div>
                    {item.actionLabel && item.action && (
                      <button
                        type="button"
                        onClick={item.action}
                        className="self-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Today</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xl font-semibold text-slate-950">{unreadTotal}</p>
                  <p className="text-xs font-medium text-slate-500">Unread</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xl font-semibold text-slate-950">{missedCalls.length}</p>
                  <p className="text-xs font-medium text-slate-500">Missed calls</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xl font-semibold text-slate-950">{pendingInviteCount}</p>
                  <p className="text-xs font-medium text-slate-500">Pending invites</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-2xl font-semibold text-slate-950">{recordingCount}</p>
                  <p className="text-xs font-medium text-slate-500">Recordings</p>
                </div>
              </div>

              {user?.id && missedCalls.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearStoredMissedCalls(user.id);
                    setMissedCalls([]);
                  }}
                  className="mt-4 w-full rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Clear missed calls
                </button>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">Workspace</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Organization</p>
                  <p className="mt-1 font-semibold text-slate-950">{activeOrganization?.name || organizationSettings?.name || 'Default Samvaad'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storage</p>
                  <p className="mt-1 text-slate-700">{organizationSettings?.storageProvider || 'ApplicationLocal'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="font-semibold text-slate-950">{organizationSettings?.maxRecordingMegabytes || 750} MB</p>
                    <p className="text-xs text-slate-500">Recording limit</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="font-semibold text-slate-950">{organizationSettings?.maxAttachmentMegabytes || 50} MB</p>
                    <p className="text-xs text-slate-500">File limit</p>
                  </div>
                </div>
                {activeOrganization?.localAppUrl && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(activeOrganization.localAppUrl || '')}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Copy workspace URL
                  </button>
                )}
              </div>
            </div>

            {user?.id && missedCalls.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">Missed calls</h2>
                <div className="mt-4 space-y-2">
                  {missedCalls.map((call) => (
                    <div key={call.meetingId} className="rounded-md border border-rose-100 bg-rose-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{call.callerName}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(call.missedAt)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMissedCalls(clearStoredMissedCall(user.id, call.meetingId))}
                          className="rounded px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-white"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
