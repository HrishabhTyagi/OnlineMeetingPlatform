import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileStatusMenu, UserStatus } from '../components/UserStatus';
import { meetingAPI, userAPI } from '../services/api';
import { initializeSignalR, joinUserNotifications, notifyUserStatusChanged, onMeetingInvite, startSignalR } from '../services/signalR';
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

function startOfWorkWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function sameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + count);
  return next;
}

function formatMonthLabel(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return formatter.format(first);
  }

  return `${formatter.format(first)} - ${formatter.format(last)}`;
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, '0')}:00`;
}

function getMeetingDurationMinutes(meeting: Meeting) {
  if (meeting.durationMinutes && meeting.durationMinutes > 0) {
    return meeting.durationMinutes;
  }

  if (meeting.endTime) {
    const duration = (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 60000;
    return Math.max(15, Math.round(duration));
  }

  return 60;
}

function minutesSinceStartOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
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

const HOUR_HEIGHT = 76;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const DAY_GRID_HEIGHT = HOUR_HEIGHT * HOURS.length;

function TimeGridCalendar({
  days,
  meetingsByDay,
  navigateToMeeting,
}: {
  days: Date[];
  meetingsByDay: Array<{ day: Date; meetings: Meeting[] }>;
  navigateToMeeting: (meetingId: string) => void;
}) {
  const now = new Date();
  const todayIndex = days.findIndex((day) => sameDate(day, now));
  const currentTimeTop = minutesSinceStartOfDay(now) / 60 * HOUR_HEIGHT;
  const gridTemplateColumns = `64px repeat(${days.length}, minmax(170px, 1fr))`;

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns }}>
        <div className="border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-400">
          Time
        </div>
        {days.map((day) => {
          const isToday = sameDate(day, now);
          return (
            <div
              key={day.toISOString()}
              className={`border-r border-slate-200 px-3 py-3 last:border-r-0 ${isToday ? 'border-t-2 border-t-indigo-600 bg-indigo-50/70' : ''}`}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-500'}`}>
                  {day.getDate()}
                </span>
                <span className={`text-sm font-medium ${isToday ? 'text-indigo-700' : 'text-slate-500'}`}>
                  {new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(day)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-[calc(100vh-330px)] min-h-[560px] overflow-auto">
        <div className="relative grid min-w-[960px]" style={{ gridTemplateColumns, height: DAY_GRID_HEIGHT }}>
          <div className="border-r border-slate-200 bg-white">
            {HOURS.map((hour) => (
              <div key={hour} className="relative border-t border-slate-200" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute left-3 top-1 text-xs text-slate-500">{formatHourLabel(hour)}</span>
              </div>
            ))}
          </div>

          {meetingsByDay.map(({ day, meetings: dayMeetings }) => (
            <div key={day.toISOString()} className="relative border-r border-slate-200 last:border-r-0">
              {HOURS.map((hour) => (
                <div key={hour} className="border-t border-slate-200" style={{ height: HOUR_HEIGHT }}>
                  <div className="mt-[37px] border-t border-dashed border-slate-100" />
                </div>
              ))}

              {dayMeetings.map((meeting) => {
                const start = new Date(meeting.startTime);
                const top = Math.max(0, minutesSinceStartOfDay(start) / 60 * HOUR_HEIGHT);
                const height = Math.max(38, getMeetingDurationMinutes(meeting) / 60 * HOUR_HEIGHT);
                return (
                  <button
                    key={meeting.id}
                    onClick={() => navigateToMeeting(meeting.id)}
                    className="absolute left-2 right-2 z-10 overflow-hidden rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-left text-indigo-950 shadow-sm hover:border-indigo-400 hover:bg-indigo-100"
                    style={{ top, height }}
                  >
                    <p className="truncate text-xs font-semibold text-indigo-700">{formatTime(meeting.startTime)}</p>
                    <p className="truncate text-sm font-semibold">{meeting.title}</p>
                    <p className="truncate text-xs text-indigo-800">{getMeetingDurationMinutes(meeting)} min</p>
                  </button>
                );
              })}
            </div>
          ))}

          {todayIndex >= 0 && (
            <div
              className="pointer-events-none absolute left-16 right-0 z-20 border-t border-red-500"
              style={{ top: currentTimeTop }}
            >
              <span className="absolute -left-2 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const meetings = useMeetingStore((state) => state.meetings);
  const setMeetings = useMeetingStore((state) => state.setMeetings);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [calendarRange, setCalendarRange] = useState<'workWeek' | 'week'>('workWeek');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notices, setNotices] = useState<string[]>([]);

  const displayName = useMemo(() => {
    if (!user) {
      return 'User';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

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
        const [meetingsResponse, profileResponse] = await Promise.all([
          meetingAPI.getMyMeetings(),
          userAPI.getProfile().catch(() => ({ data: user })),
        ]);
        setMeetings(meetingsResponse.data);
        if (profileResponse.data) {
          setUser(profileResponse.data);
        }
      } catch (error) {
        console.error('Failed to fetch meetings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, [user?.id, navigate, setMeetings, setUser]);

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
    const start = calendarRange === 'workWeek' ? startOfWorkWeek(selectedDate) : startOfWeek(selectedDate);
    const dayCount = calendarRange === 'workWeek' ? 5 : 7;
    return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
  }, [calendarRange, selectedDate]);

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

  const handleStatusChange = async (status: UserStatus) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    const nextUser = { ...user, status };
    setUser(nextUser);

    try {
      const response = await userAPI.updateStatus(status);
      setUser(response.data);
      await notifyUserStatusChanged(user.id, displayName, response.data.status).catch(() => undefined);
    } catch {
      setUser(previousUser);
    }
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
            <ProfileStatusMenu
              displayName={displayName}
              email={user?.email}
              status={user?.status}
              onChange={handleStatusChange}
              onSignOut={handleLogout}
            />
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => moveWeek(-1)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="min-w-[120px] text-center text-sm font-semibold text-slate-800">
                {formatMonthLabel(weekDays)}
              </span>
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
              <select
                value={calendarRange}
                onChange={(event) => setCalendarRange(event.target.value as 'workWeek' | 'week')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="workWeek">Work week</option>
                <option value="week">Full week</option>
              </select>
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
        ) : view === 'calendar' ? (
          <TimeGridCalendar
            days={weekDays}
            meetingsByDay={meetingsByDay}
            navigateToMeeting={(meetingId) => navigate(`/meeting/${meetingId}`)}
          />
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
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
