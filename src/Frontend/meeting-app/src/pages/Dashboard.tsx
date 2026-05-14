import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingAPI } from '../services/api';
import { initializeSignalR, joinUserNotifications, onMeetingInvite, startSignalR } from '../services/signalR';
import { useAuthStore } from '../store/authStore';
import { Meeting, useMeetingStore } from '../store/meetingStore';

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function sameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function showBrowserMeetingNotification(meeting: Meeting) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(`Meeting starting: ${meeting.title}`, {
    body: `${formatTime(meeting.startTime)} - Click to join`,
    tag: `meeting-${meeting.id}`,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = meeting.meetingLink || `/meeting/${meeting.id}`;
  };
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{meeting.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{meeting.description || 'No agenda added'}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          {meeting.status}
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>{formatDate(meeting.startTime)} at {formatTime(meeting.startTime)}</p>
        <p>{meeting.durationMinutes || 60} min - {meeting.isOnlineMeeting ? 'Online meeting' : 'In-person'}</p>
        <p>{meeting.attendeeEmails?.length || 0} attendee{meeting.attendeeEmails?.length === 1 ? '' : 's'} - {meeting.currentParticipants}/{meeting.maxParticipants} joined</p>
        {meeting.location && <p>{meeting.location}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const meetings = useMeetingStore((state) => state.meetings);
  const setMeetings = useMeetingStore((state) => state.setMeetings);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notices, setNotices] = useState<string[]>([]);

  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [meetings],
  );

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchMeetings = async () => {
      try {
        const response = await meetingAPI.getMyMeetings();
        setMeetings(response.data);
      } catch (error) {
        console.error('Failed to fetch meetings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, [user, navigate, setMeetings]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        await joinUserNotifications(user.id);
        onMeetingInvite((data) => {
          setNotices((items) => [`${data.organizerName} invited you to ${data.meetingTitle}`, ...items].slice(0, 3));
        });
      })
      .catch((error) => console.warn('Notification connection failed', error));
  }, [token, user]);

  useEffect(() => {
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const timers = sortedMeetings
      .filter((meeting) => new Date(meeting.startTime).getTime() > Date.now())
      .map((meeting) => {
        const startMs = new Date(meeting.startTime).getTime();
        const reminderMs = Math.max(0, startMs - Date.now() - 5 * 60 * 1000);
        return window.setTimeout(() => {
          setNotices((items) => [`${meeting.title} starts at ${formatTime(meeting.startTime)}. Join link is ready.`, ...items].slice(0, 3));
          showBrowserMeetingNotification(meeting);
        }, reminderMs);
      });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sortedMeetings]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [selectedDate]);

  const meetingsByDay = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        meetings: sortedMeetings.filter((meeting) => sameDate(new Date(meeting.startTime), day)),
      })),
    [sortedMeetings, weekDays],
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const moveWeek = (offset: number) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + offset * 7);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-medium text-blue-700">Calendar</p>
            <h1 className="text-2xl font-semibold text-slate-950">Meeting Platform</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-700 sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/create-meeting')}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              New meeting
            </button>
            <button
              onClick={() => navigate('/chat')}
              className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Chat
            </button>
            <div className="rounded-md border border-slate-300 bg-white p-1">
              <button
                onClick={() => setView('calendar')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  view === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                List
              </button>
            </div>
          </div>

          {view === 'calendar' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveWeek(-1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                onClick={() => moveWeek(1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {notices.length > 0 && (
          <div className="mb-6 space-y-2">
            {notices.map((notice, index) => (
              <div key={`${notice}-${index}`} className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <span>{notice}</span>
                {sortedMeetings[0] && (
                  <button
                    onClick={() => navigate(`/meeting/${sortedMeetings[0].id}`)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Join
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="rounded-md border border-slate-200 bg-white py-12 text-center text-slate-500">
            Loading meetings...
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white py-12 text-center">
            <p className="mb-4 text-slate-500">You haven't created any meetings yet.</p>
            <button
              onClick={() => navigate('/create-meeting')}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create your first meeting
            </button>
          </div>
        ) : view === 'list' ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-7">
            {meetingsByDay.map(({ day, meetings: dayMeetings }) => (
              <section key={day.toISOString()} className="min-h-[280px] rounded-md border border-slate-200 bg-white">
                <div className={`border-b border-slate-200 p-3 ${sameDate(day, new Date()) ? 'bg-blue-50' : ''}`}>
                  <p className="text-sm font-medium text-slate-500">
                    {new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}
                  </p>
                  <p className="text-2xl font-semibold text-slate-950">{day.getDate()}</p>
                </div>
                <div className="space-y-2 p-3">
                  {dayMeetings.length === 0 ? (
                    <p className="text-sm text-slate-400">No meetings</p>
                  ) : (
                    dayMeetings.map((meeting) => (
                      <button
                        key={meeting.id}
                        onClick={() => navigate(`/meeting/${meeting.id}`)}
                        className="w-full rounded-md border border-blue-100 bg-blue-50 p-3 text-left hover:border-blue-300"
                      >
                        <p className="text-xs font-medium text-blue-700">{formatTime(meeting.startTime)}</p>
                        <p className="mt-1 text-sm font-semibold text-blue-950">{meeting.title}</p>
                        <p className="mt-1 text-xs text-blue-800">{meeting.durationMinutes || 60} min</p>
                      </button>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
