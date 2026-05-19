import { useEffect, useMemo, useState, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useSamvaadTheme } from '../components/ThemeProvider';
import { ProfileStatusMenu, UserStatus } from '../components/UserStatus';
import { getMeetingJoinUrl, getOrganizationScopedPath, meetingAPI, openMeetingJoinInNewTab, userAPI } from '../services/api';
import { notifyUserStatusChanged } from '../services/signalR';
import { useAuthStore } from '../store/authStore';
import { Meeting, useMeetingStore } from '../store/meetingStore';

const MEETING_LINK_MARKER = 'Samvaad reusable meeting link';

function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9.5 14.5 14.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 7.5 12 6a4 4 0 0 1 5.7 5.7l-1.5 1.5M13.5 16.5 12 18a4 4 0 0 1-5.7-5.7l1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function MeetingIdIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8.5h6M8.5 12h7M9 15.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 5V3.5M16.5 5V3.5M7.5 20.5V19M16.5 20.5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h6.5A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-9Z" fill="currentColor" />
      <path d="m16 10 4-2.5v9L16 14v-4Z" fill="currentColor" />
    </svg>
  );
}

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8 8h10v12H8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M6 16H4V4h10v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getJoinLink(meeting: Meeting) {
  return getMeetingJoinUrl(meeting.id, meeting.meetingLink);
}

function isMeetingLink(meeting: Meeting) {
  return meeting.description === MEETING_LINK_MARKER || meeting.title.toLowerCase().includes('meeting link');
}

function parseMeetingId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    const meetingIndex = url.pathname.split('/').filter(Boolean).findIndex((part) => part.toLowerCase() === 'meeting');
    if (meetingIndex >= 0) {
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[meetingIndex + 1] || '';
    }
  } catch {
    // Treat the value as a raw meeting ID below.
  }

  return trimmed.replace(/^#/, '').split(/[/?#]/)[0];
}

export default function Meet() {
  const navigate = useNavigate();
  const { theme } = useSamvaadTheme();
  const meetings = useMeetingStore((state) => state.meetings);
  const setMeetings = useMeetingStore((state) => state.setMeetings);
  const addMeeting = useMeetingStore((state) => state.addMeeting);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const logout = useAuthStore((state) => state.logout);
  const [loading, setLoading] = useState(true);
  const [creatingLink, setCreatingLink] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [meetingIdInput, setMeetingIdInput] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const isFocusTheme = theme === 'focus';

  const displayName = useMemo(() => {
    if (!user) {
      return 'User';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const sortedMeetings = useMemo(() => (
    [...meetings].sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
  ), [meetings]);

  const meetingLinks = sortedMeetings.filter(isMeetingLink).slice(-4).reverse();
  const scheduledMeetings = sortedMeetings
    .filter((meeting) => !isMeetingLink(meeting))
    .filter((meeting) => new Date(meeting.endTime || meeting.startTime).getTime() >= Date.now() - 60000)
    .slice(0, 6);

  useEffect(() => {
    let cancelled = false;

    meetingAPI.getMyMeetings()
      .then((response) => {
        if (!cancelled) {
          setMeetings(response.data);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data || 'Unable to load meetings');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setMeetings]);

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

  const handleSwitchAccount = (userId: string) => {
    setMeetings([]);
    setError('');
    switchAccount(userId);
  };

  const handleSignOut = () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    logout();
    if (!hadOtherAccounts) {
      navigate('/login', { replace: true });
    }
  };

  const copyLink = async (meeting: Meeting) => {
    const link = getJoinLink(meeting);
    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Meeting link copied.');
    } catch {
      setCopyStatus(link);
    }
  };

  const createMeetingLink = async () => {
    if (creatingLink) {
      return;
    }

    const start = new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60000);

    setCreatingLink(true);
    setError('');
    setCopyStatus('');

    try {
      const response = await meetingAPI.createMeeting({
        title: 'Meeting link',
        description: MEETING_LINK_MARKER,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationMinutes: 60,
        attendeeEmails: [],
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
        maxParticipants: 100,
        isRecorded: false,
      });

      addMeeting(response.data);
      await copyLink(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || 'Unable to create meeting link');
    } finally {
      setCreatingLink(false);
    }
  };

  const joinByMeetingId = () => {
    const meetingId = parseMeetingId(meetingIdInput);
    if (!meetingId) {
      setError('Enter a meeting ID or join link');
      return;
    }

    setError('');
    setJoinModalOpen(false);
    openMeetingJoinInNewTab(meetingId);
  };

  return (
    <AppShell
      active="meet"
      title="Meet"
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
      <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-slate-100 px-6 py-10 text-slate-950">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold text-slate-900">Meet</h2>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <button
              type="button"
              onClick={createMeetingLink}
              disabled={creatingLink}
              className="flex h-16 items-center justify-center gap-3 rounded-md bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              <LinkIcon className="h-5 w-5" />
              {creatingLink ? 'Creating link...' : 'Create a meeting link'}
            </button>
            <button
              type="button"
              onClick={() => navigate(getOrganizationScopedPath('/create-meeting'))}
              className="flex h-16 items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <CalendarIcon className="h-5 w-5 text-rose-500" />
              Schedule a meeting
            </button>
            <button
              type="button"
              onClick={() => {
                setJoinModalOpen(true);
                setError('');
              }}
              className="flex h-16 items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <MeetingIdIcon className="h-5 w-5 text-sky-600" />
              Join with a meeting ID
            </button>
          </div>

          {(error || copyStatus) && (
            <div className={`mt-5 rounded-md px-4 py-3 text-sm font-medium ${
              error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {error || copyStatus}
            </div>
          )}

          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-900">Meeting links</h3>
              {meetingLinks.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyLink(meetingLinks[0])}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  <CopyIcon className="h-4 w-4" />
                  Copy latest link
                </button>
              )}
            </div>

            <div className="mt-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
              {loading ? (
                <p className="text-sm text-slate-500">Loading meeting links...</p>
              ) : meetingLinks.length === 0 ? (
                <div className="flex min-h-36 flex-col justify-center">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <p className="text-base font-semibold text-slate-800">Quickly create, save, and share links with anyone.</p>
                  <button
                    type="button"
                    onClick={createMeetingLink}
                    className="mt-7 w-fit text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    Create your first meeting link
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {meetingLinks.map((meeting) => (
                    <div key={meeting.id} className="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{meeting.title}</p>
                        <p className="mt-1 truncate text-sm text-slate-500">{getJoinLink(meeting)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => copyLink(meeting)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          title="Copy link"
                          aria-label="Copy link"
                        >
                          <CopyIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openMeetingJoinInNewTab(meeting.id, meeting.meetingLink)}
                          className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Join
                          <ArrowIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-900">Scheduled meetings</h3>
              <button
                type="button"
                onClick={() => navigate(getOrganizationScopedPath('/dashboard'))}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                <CalendarIcon className="h-4 w-4" />
                View in calendar
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="p-6 text-sm text-slate-500">Loading scheduled meetings...</div>
              ) : scheduledMeetings.length === 0 ? (
                <div className="grid min-h-48 md:grid-cols-[minmax(0,1fr)_minmax(280px,460px)]">
                  <div className="flex items-center justify-center px-8 py-10 text-sm text-slate-500">
                    You do not have anything scheduled.
                  </div>
                  <div className={`relative hidden overflow-hidden bg-gradient-to-br md:block ${
                    isFocusTheme
                      ? 'from-slate-900 via-slate-800 to-cyan-950'
                      : 'from-sky-50 via-indigo-50 to-rose-50'
                  }`}>
                    <div className={`absolute left-14 top-16 h-20 w-28 rotate-[-12deg] rounded-md border shadow-sm ${
                      isFocusTheme ? 'border-slate-600 bg-slate-800/80' : 'border-white/70 bg-white/80'
                    }`} />
                    <div className={`absolute bottom-10 left-20 h-12 w-40 rotate-[8deg] rounded-md ${
                      isFocusTheme ? 'bg-cyan-500/20' : 'bg-indigo-500/20'
                    }`} />
                    <div className={`absolute right-16 top-14 flex h-20 w-20 items-center justify-center rounded-full shadow-sm ${
                      isFocusTheme ? 'bg-cyan-500/20 text-cyan-300' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      <VideoIcon className="h-8 w-8" />
                    </div>
                    <div className={`absolute bottom-14 right-20 h-24 w-28 rounded-t-md shadow-sm ${
                      isFocusTheme ? 'bg-slate-700/85' : 'bg-white/85'
                    }`} />
                    <div className={`absolute bottom-14 right-20 h-6 w-28 rounded-t-md ${
                      isFocusTheme ? 'bg-cyan-400/40' : 'bg-rose-200'
                    }`} />
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {scheduledMeetings.map((meeting) => (
                    <div key={meeting.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{meeting.title || 'Untitled meeting'}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatMeetingDate(meeting.startTime)}
                          {meeting.endTime ? ` - ${formatShortTime(meeting.endTime)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => copyLink(meeting)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          title="Copy join link"
                          aria-label="Copy join link"
                        >
                          <CopyIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openMeetingJoinInNewTab(meeting.id, meeting.meetingLink)}
                          className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          Join
                          <ArrowIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {joinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
            <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-950">Join with a meeting ID</h3>
              <p className="mt-1 text-sm text-slate-500">Paste a meeting ID or a full Samvaad meeting link.</p>
              <input
                value={meetingIdInput}
                onChange={(event) => setMeetingIdInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    joinByMeetingId();
                  }
                }}
                autoFocus
                placeholder="Meeting ID or link"
                className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setJoinModalOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={joinByMeetingId}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
