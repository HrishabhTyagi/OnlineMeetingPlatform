import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import CalendarSyncPanel from '../components/CalendarSyncPanel';
import { ProfileStatusMenu, UserAvatar, UserStatus, UserStatusBadge } from '../components/UserStatus';
import { getMeetingJoinUrl, getOrganizationScopedPath, meetingAPI, openMeetingJoinInNewTab, userAPI } from '../services/api';
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

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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

function getMonthCalendarDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
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

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function parseAttendees(value: string) {
  return value
    .split(/[\n,;]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function createSlotDate(day: Date, minutes: number) {
  const next = new Date(day);
  next.setHours(0, minutes, 0, 0);
  return next;
}

function createQuickScheduleForm(start: Date): QuickScheduleForm {
  return {
    title: '',
    attendeeText: '',
    date: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    durationMinutes: 30,
    location: '',
    description: '',
    isOnlineMeeting: true,
    lobbyEnabled: true,
    allowChat: true,
    allowRecording: false,
    recurrenceRule: '',
  };
}

function toEditMeetingForm(meeting: Meeting): EditMeetingForm {
  const start = new Date(meeting.startTime);
  return {
    title: meeting.title,
    attendeeText: meeting.attendeeEmails?.join(', ') || '',
    date: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    durationMinutes: getMeetingDurationMinutes(meeting),
    location: meeting.location || '',
    description: meeting.description || '',
    isOnlineMeeting: meeting.isOnlineMeeting,
    lobbyEnabled: meeting.lobbyEnabled,
    allowChat: meeting.allowChat,
    allowRecording: meeting.allowRecording,
    recurrenceRule: meeting.recurrenceRule || '',
    maxParticipants: meeting.maxParticipants || 100,
    allowReactions: meeting.allowReactions,
    allowScreenShare: meeting.allowScreenShare,
    allowAttendeeUnmute: meeting.allowAttendeeUnmute,
    allowTranscription: meeting.allowTranscription,
  };
}

function getJoinLink(meeting: Meeting) {
  return getMeetingJoinUrl(meeting.id, meeting.meetingLink);
}

function getRecordingLink(meeting: Meeting) {
  if (!meeting.recordingUrl) {
    return '';
  }

  return meeting.recordingUrl.startsWith('http')
    ? meeting.recordingUrl
    : `http://localhost:5000${meeting.recordingUrl}`;
}

function getMeetingEndDate(meeting: Meeting) {
  if (meeting.endTime) {
    return new Date(meeting.endTime);
  }

  return new Date(new Date(meeting.startTime).getTime() + getMeetingDurationMinutes(meeting) * 60000);
}

function getCalendarMeetingState(meeting: Meeting, now = new Date()) {
  if (meeting.status === 'Cancelled') {
    return 'cancelled';
  }

  if (meeting.status === 'Completed' || getMeetingEndDate(meeting) <= now) {
    return 'completed';
  }

  if (new Date(meeting.startTime) <= now && getMeetingEndDate(meeting) > now) {
    return 'ongoing';
  }

  return 'upcoming';
}

function canEditCalendarMeeting(meeting: Meeting) {
  return getCalendarMeetingState(meeting) === 'upcoming';
}

function canJoinCalendarMeeting(meeting: Meeting) {
  return getCalendarMeetingState(meeting) === 'ongoing' || getCalendarMeetingState(meeting) === 'upcoming';
}

function eventStateClasses(state: string) {
  if (state === 'ongoing') {
    return 'border-emerald-400 bg-emerald-50 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-100';
  }

  if (state === 'completed') {
    return 'border-slate-300 bg-slate-100 text-slate-600 hover:border-slate-400 hover:bg-slate-200';
  }

  if (state === 'cancelled') {
    return 'border-red-200 bg-red-50 text-red-700 line-through hover:border-red-300 hover:bg-red-100';
  }

  return 'border-indigo-300 bg-indigo-50 text-indigo-950 hover:border-indigo-500 hover:bg-indigo-100';
}

function normalizeRecurrence(rule?: string) {
  return RECURRENCE_OPTIONS.some((option) => option.value === rule) ? rule || '' : '';
}

function recurrenceLabel(rule?: string) {
  return RECURRENCE_OPTIONS.find((option) => option.value === normalizeRecurrence(rule))?.label || 'Does not repeat';
}

function shouldShowOccurrence(rule: string, originalStart: Date, day: Date) {
  if (day < new Date(originalStart.getFullYear(), originalStart.getMonth(), originalStart.getDate())) {
    return false;
  }

  if (rule === 'Daily') {
    return true;
  }

  if (rule === 'Weekdays') {
    return day.getDay() >= 1 && day.getDay() <= 5;
  }

  if (rule === 'Weekly') {
    return day.getDay() === originalStart.getDay();
  }

  return sameDate(originalStart, day);
}

function expandMeetingsForCalendar(meetings: Meeting[], days: Date[]) {
  if (days.length === 0) {
    return [];
  }

  return meetings.flatMap((meeting) => {
    const rule = normalizeRecurrence(meeting.recurrenceRule);
    const originalStart = new Date(meeting.startTime);
    const duration = getMeetingDurationMinutes(meeting);

    if (!rule) {
      return [meeting];
    }

    return days
      .filter((day) => shouldShowOccurrence(rule, originalStart, day))
      .map((day) => {
        const occurrenceStart = new Date(day);
        occurrenceStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration * 60000);
        return {
          ...meeting,
          startTime: occurrenceStart.toISOString(),
          endTime: occurrenceEnd.toISOString(),
        };
      });
  });
}

function findUserByEmail(users: UserSummary[], email: string) {
  return users.find((item) => item.email.toLowerCase() === email.toLowerCase());
}

function hasMeetingConflict(meetings: Meeting[], start: Date, durationMinutes: number, excludedMeetingId?: string) {
  const end = new Date(start.getTime() + durationMinutes * 60000);

  return meetings.some((meeting) => {
    if (meeting.id === excludedMeetingId || ['Completed', 'Cancelled'].includes(meeting.status)) {
      return false;
    }

    const meetingStart = new Date(meeting.startTime);
    const meetingEnd = getMeetingEndDate(meeting);
    return meetingStart < end && meetingEnd > start;
  });
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
    openMeetingJoinInNewTab(meeting.id, meeting.meetingLink);
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
const QUICK_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];
const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekdays', label: 'Every weekday' },
  { value: 'Weekly', label: 'Weekly' },
];

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  profilePictureUrl?: string;
  status?: string;
}

interface DashboardNotification {
  id: string;
  message: string;
  time: string;
  meetingId?: string;
}

interface QuickScheduleForm {
  title: string;
  attendeeText: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location: string;
  description: string;
  isOnlineMeeting: boolean;
  lobbyEnabled: boolean;
  allowChat: boolean;
  allowRecording: boolean;
  recurrenceRule: string;
}

interface EditMeetingForm extends QuickScheduleForm {
  maxParticipants: number;
  allowReactions: boolean;
  allowScreenShare: boolean;
  allowAttendeeUnmute: boolean;
  allowTranscription: boolean;
}

interface CalendarMeetingLayout {
  meeting: Meeting;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
  laneCount: number;
}

interface CalendarMeetingLayoutSeed {
  meeting: Meeting;
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
}

function getCalendarMeetingLayouts(meetings: Meeting[]): CalendarMeetingLayout[] {
  const seeds = meetings
    .map((meeting) => {
      const start = new Date(meeting.startTime);
      const rawStartMinute = minutesSinceStartOfDay(start);
      const rawEndMinute = rawStartMinute + getMeetingDurationMinutes(meeting);
      const startMinute = Math.max(0, Math.min(24 * 60, rawStartMinute));
      const endMinute = Math.max(0, Math.min(24 * 60, rawEndMinute));

      if (endMinute <= startMinute) {
        return null;
      }

      const renderedHeight = Math.max(28, (endMinute - startMinute) / 60 * HOUR_HEIGHT);
      const top = Math.min(startMinute / 60 * HOUR_HEIGHT, DAY_GRID_HEIGHT - renderedHeight);

      return {
        meeting,
        startMinute,
        endMinute,
        top,
        height: renderedHeight,
      };
    })
    .filter((layout): layout is CalendarMeetingLayoutSeed => Boolean(layout))
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

  const layouts: CalendarMeetingLayout[] = [];
  let cluster: CalendarMeetingLayoutSeed[] = [];
  let clusterEndMinute = -1;

  const flushCluster = () => {
    if (cluster.length === 0) {
      return;
    }

    const laneEndMinutes: number[] = [];
    const assigned = cluster.map((item) => {
      const reusableLane = laneEndMinutes.findIndex((endMinute) => endMinute <= item.startMinute);
      const laneIndex = reusableLane >= 0 ? reusableLane : laneEndMinutes.length;
      laneEndMinutes[laneIndex] = item.endMinute;
      return { ...item, laneIndex };
    });
    const laneCount = Math.max(1, laneEndMinutes.length);

    assigned.forEach((item) => {
      layouts.push({
        meeting: item.meeting,
        top: item.top,
        height: item.height,
        leftPercent: item.laneIndex / laneCount * 100,
        widthPercent: 100 / laneCount,
        laneCount,
      });
    });

    cluster = [];
    clusterEndMinute = -1;
  };

  seeds.forEach((item) => {
    if (cluster.length > 0 && item.startMinute >= clusterEndMinute) {
      flushCluster();
    }

    cluster.push(item);
    clusterEndMinute = Math.max(clusterEndMinute, item.endMinute);
  });

  flushCluster();
  return layouts;
}

function TimeGridCalendar({
  days,
  meetingsByDay,
  onMeetingClick,
  onTimeSlotClick,
  onMeetingReschedule,
}: {
  days: Date[];
  meetingsByDay: Array<{ day: Date; meetings: Meeting[] }>;
  onMeetingClick: (meeting: Meeting) => void;
  onTimeSlotClick: (start: Date) => void;
  onMeetingReschedule: (meeting: Meeting, start: Date) => Promise<void>;
}) {
  const now = new Date();
  const [blockedHoverDay, setBlockedHoverDay] = useState<string | null>(null);
  const todayIndex = days.findIndex((day) => sameDate(day, now));
  const currentTimeTop = minutesSinceStartOfDay(now) / 60 * HOUR_HEIGHT;
  const gridTemplateColumns = `64px repeat(${days.length}, minmax(170px, 1fr))`;

  const getSlotStartFromPointer = (event: MouseEvent<HTMLDivElement> | DragEvent<HTMLDivElement>, day: Date) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetY = Math.max(0, Math.min(DAY_GRID_HEIGHT, event.clientY - bounds.top));
    const clickedMinutes = offsetY / HOUR_HEIGHT * 60;
    const roundedMinutes = Math.min(23 * 60 + 30, Math.floor(clickedMinutes / 30) * 30);
    return createSlotDate(day, roundedMinutes);
  };

  const handleColumnClick = (event: MouseEvent<HTMLDivElement>, day: Date) => {
    const start = getSlotStartFromPointer(event, day);
    if (start < new Date(Date.now() - 60000)) {
      return;
    }

    onTimeSlotClick(start);
  };

  const handleMeetingDragStart = (event: DragEvent<HTMLButtonElement>, meeting: Meeting) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-samvaad-meeting', JSON.stringify({
      id: meeting.id,
      startTime: meeting.startTime,
    }));
  };

  const handleMeetingDrop = async (event: DragEvent<HTMLDivElement>, day: Date) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = event.dataTransfer.getData('application/x-samvaad-meeting');
    if (!payload) {
      return;
    }

    let parsed: { id: string; startTime: string };
    try {
      parsed = JSON.parse(payload) as { id: string; startTime: string };
    } catch {
      return;
    }
    const draggedMeeting = meetingsByDay
      .flatMap((item) => item.meetings)
      .find((meeting) => meeting.id === parsed.id && meeting.startTime === parsed.startTime)
      || meetingsByDay.flatMap((item) => item.meetings).find((meeting) => meeting.id === parsed.id);

    if (!draggedMeeting) {
      return;
    }

    const nextStart = getSlotStartFromPointer(event, day);
    if (nextStart < new Date(Date.now() - 60000)) {
      window.alert('This time has already passed. Choose a future time for the meeting.');
      return;
    }

    const nextEnd = new Date(nextStart.getTime() + getMeetingDurationMinutes(draggedMeeting) * 60000);
    const confirmMessage = [
      `Move "${draggedMeeting.title}"?`,
      `${formatDateTime(nextStart)} - ${formatTime(nextEnd.toISOString())}`,
      draggedMeeting.recurrenceRule ? 'This meeting repeats, so the meeting schedule will be updated.' : '',
      'Do you really want to change this meeting time?',
    ].filter(Boolean).join('\n');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    await onMeetingReschedule(draggedMeeting, nextStart);
  };

  return (
    <section className="samvaad-calendar overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="samvaad-calendar-header grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns }}>
        <div className="samvaad-calendar-time-header border-r border-slate-200 px-3 py-3 text-xs font-medium text-slate-400">
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

      <div className="samvaad-calendar-scroll max-h-[calc(100vh-330px)] min-h-[560px] overflow-auto">
        <div className="relative grid min-w-[960px]" style={{ gridTemplateColumns, height: DAY_GRID_HEIGHT }}>
          <div className="samvaad-calendar-time-column border-r border-slate-200 bg-white">
            {HOURS.map((hour) => (
              <div key={hour} className="relative border-t border-slate-200" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute left-3 top-1 text-xs text-slate-500">{formatHourLabel(hour)}</span>
              </div>
            ))}
          </div>

          {meetingsByDay.map(({ day, meetings: dayMeetings }) => {
            const dayKey = toDateInputValue(day);
            const isPastDay = createSlotDate(day, 24 * 60 - 1) < new Date(Date.now() - 60000);
            const cursorClass = isPastDay || blockedHoverDay === dayKey ? 'cursor-not-allowed' : 'cursor-crosshair';
            return (
            <div
              key={day.toISOString()}
              title={isPastDay ? 'Past time cannot be scheduled' : 'Click a future time to schedule'}
              onClick={(event) => handleColumnClick(event, day)}
              onMouseMove={(event) => {
                const start = getSlotStartFromPointer(event, day);
                setBlockedHoverDay(start < new Date(Date.now() - 60000) ? dayKey : null);
              }}
              onMouseLeave={() => {
                if (blockedHoverDay === dayKey) {
                  setBlockedHoverDay(null);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const start = getSlotStartFromPointer(event, day);
                event.dataTransfer.dropEffect = start < new Date(Date.now() - 60000) ? 'none' : 'move';
              }}
              onDrop={(event) => handleMeetingDrop(event, day)}
              className={`samvaad-calendar-day-column relative border-r border-slate-200 last:border-r-0 ${cursorClass}`}
            >
              {HOURS.map((hour) => (
                <div key={hour} className="border-t border-slate-200" style={{ height: HOUR_HEIGHT }}>
                  <div className="mt-[37px] border-t border-dashed border-slate-100" />
                </div>
              ))}

              {getCalendarMeetingLayouts(dayMeetings).map(({ meeting, top, height, leftPercent, widthPercent }) => {
                const state = getCalendarMeetingState(meeting, now);
                return (
                  <button
                    key={`${meeting.id}-${meeting.startTime}`}
                    draggable={canEditCalendarMeeting(meeting)}
                    onDragStart={(event) => handleMeetingDragStart(event, meeting)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMeetingClick(meeting);
                    }}
                    className={`samvaad-calendar-event absolute z-10 overflow-hidden rounded-md border px-2 py-1.5 text-left shadow-sm transition hover:z-20 ${eventStateClasses(state)}`}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPercent}% + 4px)`,
                      width: `calc(${widthPercent}% - 8px)`,
                    }}
                  >
                    <p className="truncate text-[11px] font-semibold capitalize leading-tight">{state} - {formatTime(meeting.startTime)}</p>
                    <p className="truncate text-xs font-semibold leading-tight sm:text-sm">{meeting.title}</p>
                    <p className="truncate text-[11px] leading-tight">{getMeetingDurationMinutes(meeting)} min</p>
                  </button>
                );
              })}
            </div>
          );
          })}

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

function MonthCalendar({
  days,
  selectedDate,
  meetingsByDay,
  onMeetingClick,
  onTimeSlotClick,
}: {
  days: Date[];
  selectedDate: Date;
  meetingsByDay: Array<{ day: Date; meetings: Meeting[] }>;
  onMeetingClick: (meeting: Meeting) => void;
  onTimeSlotClick: (start: Date) => void;
}) {
  const now = new Date();
  const meetingsByDate = new Map(meetingsByDay.map((item) => [toDateInputValue(item.day), item.meetings]));

  const createMonthSlot = (day: Date) => {
    const slot = new Date(day);
    const roundedHour = Math.max(now.getHours() + 1, 9);
    slot.setHours(sameDate(day, now) ? Math.min(23, roundedHour) : 9, 0, 0, 0);
    return slot;
  };

  return (
    <section className="samvaad-calendar overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-white">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
        ))}
      </div>
      <div className="grid min-h-[640px] grid-cols-7">
        {days.map((day) => {
          const dayKey = toDateInputValue(day);
          const dayMeetings = meetingsByDate.get(dayKey) || [];
          const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
          const isPastDay = createSlotDate(day, 24 * 60 - 1) < new Date(Date.now() - 60000);

          return (
            <div
              key={dayKey}
              onClick={() => {
                const slot = createMonthSlot(day);
                if (slot < new Date(Date.now() - 60000)) {
                  return;
                }
                onTimeSlotClick(slot);
              }}
              title={isPastDay ? 'Past days cannot be scheduled' : 'Click to schedule on this day'}
              className={`min-h-28 border-r border-t border-slate-200 p-2 last:border-r-0 ${
                isPastDay ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-blue-50/40'
              } ${isCurrentMonth ? 'text-slate-900' : 'bg-slate-50/70 text-slate-400'}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${sameDate(day, now) ? 'bg-indigo-600 text-white' : ''}`}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayMeetings.slice(0, 4).map((meeting) => {
                  const state = getCalendarMeetingState(meeting, now);
                  return (
                    <button
                      key={`${meeting.id}-${meeting.startTime}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMeetingClick(meeting);
                      }}
                      className={`block w-full rounded border px-2 py-1 text-left text-[11px] shadow-sm ${eventStateClasses(state)}`}
                    >
                      <span className="block truncate font-semibold">{formatTime(meeting.startTime)} - {meeting.title}</span>
                      <span className="block truncate">{getMeetingDurationMinutes(meeting)} min</span>
                    </button>
                  );
                })}
                {dayMeetings.length > 4 && (
                  <p className="px-1 text-xs font-semibold text-slate-500">+{dayMeetings.length - 4} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuickScheduleModal({
  form,
  error,
  saving,
  createdMeeting,
  copyStatus,
  users,
  onChange,
  onClose,
  onSubmit,
  onCopy,
  onJoin,
}: {
  form: QuickScheduleForm;
  error: string;
  saving: boolean;
  createdMeeting: Meeting | null;
  copyStatus: string;
  users: UserSummary[];
  onChange: (updates: Partial<QuickScheduleForm>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onCopy: () => void;
  onJoin: (meeting: Meeting) => void;
}) {
  const startDate = new Date(`${form.date}T${form.startTime}`);
  const endDate = new Date(startDate.getTime() + Number(form.durationMinutes) * 60000);
  const joinLink = createdMeeting ? getMeetingJoinUrl(createdMeeting.id, createdMeeting.meetingLink) : '';
  const attendees = parseAttendees(form.attendeeText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-blue-700">Calendar</p>
            <h2 className="text-xl font-semibold text-slate-950">Schedule meeting</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {createdMeeting && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">Meeting scheduled</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={joinLink}
                  className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950"
                />
                <button
                  onClick={onCopy}
                  className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  {copyStatus || 'Copy link'}
                </button>
                <button
                  onClick={() => onJoin(createdMeeting)}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Open
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Title</label>
            <input
              value={form.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="Add a title"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(event) => onChange({ date: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Start</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => onChange({ startTime: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Duration</label>
              <select
                value={form.durationMinutes}
                onChange={(event) => onChange({ durationMinutes: Number(event.target.value) })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {QUICK_DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration < 60 ? `${duration} min` : `${duration / 60} hr${duration > 60 ? 's' : ''}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {Number.isNaN(startDate.getTime()) ? 'Choose a meeting time' : `${formatDateTime(startDate)} - ${formatTime(endDate.toISOString())}`}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Required attendees</label>
            <textarea
              value={form.attendeeText}
              onChange={(event) => onChange({ attendeeText: event.target.value })}
              placeholder="name@example.com, teammate@example.com"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {attendees.length > 0 && (
              <div className="mt-2 space-y-2">
                {attendees.map((email) => {
                  const attendee = findUserByEmail(users, email);
                  return (
                    <div key={email} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700">
                        {attendee && (
                          <UserAvatar
                            displayName={attendee.fullName || `${attendee.firstName} ${attendee.lastName}`.trim()}
                            email={attendee.email}
                            profilePictureUrl={attendee.profilePictureUrl}
                            status={attendee.status}
                            showStatus
                            size="sm"
                          />
                        )}
                        <span className="truncate">{attendee?.fullName || email}</span>
                      </span>
                      {attendee ? (
                        <UserStatusBadge status={attendee.status} />
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">External invite</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
              <input
                value={form.location}
                onChange={(event) => onChange({ location: event.target.value })}
                placeholder="Room, office, or link"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Repeat</label>
              <select
                value={form.recurrenceRule}
                onChange={(event) => onChange({ recurrenceRule: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Agenda</label>
            <textarea
              value={form.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="Add agenda, notes, or preparation details"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isOnlineMeeting}
                onChange={(event) => onChange({ isOnlineMeeting: event.target.checked })}
                className="h-4 w-4"
              />
              Online meeting
            </label>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.lobbyEnabled}
                onChange={(event) => onChange({ lobbyEnabled: event.target.checked })}
                className="h-4 w-4"
              />
              Use lobby
            </label>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.allowChat}
                onChange={(event) => onChange({ allowChat: event.target.checked })}
                className="h-4 w-4"
              />
              Allow chat
            </label>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.allowRecording}
                onChange={(event) => onChange({ allowRecording: event.target.checked })}
                className="h-4 w-4"
              />
              Allow recording
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeetingDetailsModal({
  meeting,
  editForm,
  users,
  editMode,
  saving,
  error,
  copyStatus,
  onClose,
  onJoin,
  onCopy,
  onEdit,
  onEditChange,
  onSave,
  onCancelEdit,
  onCancelMeeting,
}: {
  meeting: Meeting;
  editForm: EditMeetingForm;
  users: UserSummary[];
  editMode: boolean;
  saving: boolean;
  error: string;
  copyStatus: string;
  onClose: () => void;
  onJoin: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onEditChange: (updates: Partial<EditMeetingForm>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onCancelMeeting: () => void;
}) {
  const attendees = parseAttendees(editMode ? editForm.attendeeText : meeting.attendeeEmails?.join(', ') || '');
  const meetingStart = editMode ? new Date(`${editForm.date}T${editForm.startTime}`) : new Date(meeting.startTime);
  const durationMinutes = editMode ? Number(editForm.durationMinutes) : getMeetingDurationMinutes(meeting);
  const meetingEnd = new Date(meetingStart.getTime() + durationMinutes * 60000);
  const joinLink = getJoinLink(meeting);
  const editable = canEditCalendarMeeting(meeting);
  const joinable = canJoinCalendarMeeting(meeting);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-blue-700">Meeting details</p>
            <h2 className="text-xl font-semibold text-slate-950">{editMode ? 'Edit meeting' : meeting.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!editMode ? (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{meeting.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDateTime(meetingStart)} - {formatTime(meetingEnd.toISOString())}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{durationMinutes} min - {recurrenceLabel(meeting.recurrenceRule)}</p>
                    {meeting.location && <p className="mt-1 text-sm text-slate-600">{meeting.location}</p>}
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{meeting.status}</span>
                </div>
                {meeting.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{meeting.description}</p>}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Join link</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input readOnly value={joinLink} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" />
                  <button onClick={onCopy} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {copyStatus || 'Copy'}
                  </button>
                </div>
              </div>

              {meeting.recordingUrl && (
                <a
                  href={getRecordingLink(meeting)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Open recording
                </a>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Attendees</p>
                {attendees.length === 0 ? (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">No attendees added.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {attendees.map((email) => {
                      const attendee = findUserByEmail(users, email);
                      return (
                        <div key={email} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2 text-slate-700">
                            {attendee && (
                              <UserAvatar
                                displayName={attendee.fullName || `${attendee.firstName} ${attendee.lastName}`.trim()}
                                email={attendee.email}
                                profilePictureUrl={attendee.profilePictureUrl}
                                status={attendee.status}
                                showStatus
                                size="sm"
                              />
                            )}
                            <span className="truncate">{attendee?.fullName || email}</span>
                          </span>
                          {attendee ? <UserStatusBadge status={attendee.status} /> : <span className="text-xs text-slate-500">External</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Title</label>
                <input
                  value={editForm.title}
                  onChange={(event) => onEditChange({ title: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
                  <input type="date" value={editForm.date} onChange={(event) => onEditChange({ date: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Start</label>
                  <input type="time" value={editForm.startTime} onChange={(event) => onEditChange({ startTime: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Duration</label>
                  <select value={editForm.durationMinutes} onChange={(event) => onEditChange({ durationMinutes: Number(event.target.value) })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500">
                    {QUICK_DURATION_OPTIONS.map((duration) => <option key={duration} value={duration}>{duration < 60 ? `${duration} min` : `${duration / 60} hr${duration > 60 ? 's' : ''}`}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Repeat</label>
                  <select value={editForm.recurrenceRule} onChange={(event) => onEditChange({ recurrenceRule: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500">
                    {RECURRENCE_OPTIONS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
                  <input value={editForm.location} onChange={(event) => onEditChange({ location: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Required attendees</label>
                <textarea value={editForm.attendeeText} onChange={(event) => onEditChange({ attendeeText: event.target.value })} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Agenda</label>
                <textarea value={editForm.description} onChange={(event) => onEditChange({ description: event.target.value })} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['isOnlineMeeting', 'Online meeting'],
                  ['lobbyEnabled', 'Use lobby'],
                  ['allowChat', 'Allow chat'],
                  ['allowRecording', 'Allow recording'],
                  ['allowReactions', 'Allow reactions'],
                  ['allowScreenShare', 'Allow screen sharing'],
                  ['allowAttendeeUnmute', 'Allow attendees to unmute'],
                  ['allowTranscription', 'Allow transcription'],
                ].map(([name, label]) => (
                  <label key={name} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm[name as keyof EditMeetingForm])}
                      onChange={(event) => onEditChange({ [name]: event.target.checked } as Partial<EditMeetingForm>)}
                      className="h-4 w-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-5 py-4">
          {!editMode ? (
            <>
              {editable && (
                <>
                  <button onClick={onCancelMeeting} className="mr-auto rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                    Cancel meeting
                  </button>
                  <button onClick={onEdit} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Edit
                  </button>
                </>
              )}
              {joinable && (
                <button onClick={onJoin} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Join
                </button>
              )}
              {!editable && !joinable && (
                <span className="mr-auto rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
                  Past meeting: chat and recordings only
                </span>
              )}
            </>
          ) : (
            <>
              <button onClick={onCancelEdit} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Back
              </button>
              <button onClick={onSave} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const meetings = useMeetingStore((state) => state.meetings);
  const setMeetings = useMeetingStore((state) => state.setMeetings);
  const addMeeting = useMeetingStore((state) => state.addMeeting);
  const updateMeetingInStore = useMeetingStore((state) => state.updateMeeting);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [calendarRange, setCalendarRange] = useState<'workWeek' | 'week' | 'month'>('workWeek');
  const [dashboardView, setDashboardView] = useState<'calendar' | 'recordings'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notices, setNotices] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [knownUsers, setKnownUsers] = useState<UserSummary[]>([]);
  const [quickScheduleForm, setQuickScheduleForm] = useState<QuickScheduleForm | null>(null);
  const [quickScheduleError, setQuickScheduleError] = useState('');
  const [quickScheduleSaving, setQuickScheduleSaving] = useState(false);
  const [quickCreatedMeeting, setQuickCreatedMeeting] = useState<Meeting | null>(null);
  const [quickCopyStatus, setQuickCopyStatus] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [meetingEditMode, setMeetingEditMode] = useState(false);
  const [meetingEditForm, setMeetingEditForm] = useState<EditMeetingForm | null>(null);
  const [meetingModalError, setMeetingModalError] = useState('');
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingCopyStatus, setMeetingCopyStatus] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  const addNotification = (notification: Omit<DashboardNotification, 'id' | 'time'>) => {
    setNotifications((items) => [
      {
        ...notification,
        id: `${Date.now()}-${items.length}`,
        time: new Date().toISOString(),
      },
      ...items,
    ].slice(0, 20));
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchMeetings = async () => {
      try {
        const [meetingsResponse, profileResponse, usersResponse] = await Promise.all([
          meetingAPI.getMyMeetings(),
          userAPI.getProfile().catch(() => ({ data: user })),
          userAPI.searchUsers().catch(() => ({ data: [] })),
        ]);
        setMeetings(meetingsResponse.data);
        setKnownUsers(usersResponse.data);
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
          const message = `${data.organizerName} invited you to ${data.meetingTitle}`;
          setNotices((items) => [message, ...items].slice(0, 3));
          addNotification({ message, meetingId: data.meetingId });
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
          const message = `${meeting.title} starts at ${formatTime(meeting.startTime)}. Join link is ready.`;
          setNotices((items) => [message, ...items].slice(0, 3));
          addNotification({ message, meetingId: meeting.id });
          showBrowserMeetingNotification(meeting);
        }, reminderMs);
      });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sortedMeetings]);

  const weekDays = useMemo(() => {
    if (calendarRange === 'month') {
      return getMonthCalendarDays(selectedDate);
    }

    const start = calendarRange === 'workWeek' ? startOfWorkWeek(selectedDate) : startOfWeek(selectedDate);
    const dayCount = calendarRange === 'workWeek' ? 5 : 7;
    return Array.from({ length: dayCount }, (_, index) => addDays(start, index));
  }, [calendarRange, selectedDate]);

  const visibleMeetings = useMemo(
    () => expandMeetingsForCalendar(sortedMeetings, weekDays),
    [sortedMeetings, weekDays],
  );

  const meetingsByDay = useMemo(
    () =>
      weekDays.map((day) => ({
        day,
        meetings: visibleMeetings.filter((meeting) => sameDate(new Date(meeting.startTime), day)),
      })),
    [visibleMeetings, weekDays],
  );

  const recordingMeetings = useMemo(
    () => sortedMeetings.filter((meeting) => meeting.recordingUrl),
    [sortedMeetings],
  );

  const handleLogout = () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    logout();
    if (!hadOtherAccounts) {
      navigate('/login');
    }
  };

  const handleSwitchAccount = (userId: string) => {
    setLoading(true);
    setMeetings([]);
    setNotices([]);
    setNotifications([]);
    closeMeetingDetails();
    closeQuickSchedule();
    switchAccount(userId);
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

  const handleAvatarChange = async (file: File) => {
    if (!user) {
      return;
    }

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

  const openQuickSchedule = (start: Date) => {
    if (start < new Date(Date.now() - 60000)) {
      return;
    }

    setQuickScheduleForm(createQuickScheduleForm(start));
    setQuickScheduleError('');
    setQuickCreatedMeeting(null);
    setQuickCopyStatus('');
  };

  const updateQuickScheduleForm = (updates: Partial<QuickScheduleForm>) => {
    setQuickScheduleForm((current) => current ? { ...current, ...updates } : current);
    setQuickScheduleError('');
    setQuickCopyStatus('');
  };

  const closeQuickSchedule = () => {
    setQuickScheduleForm(null);
    setQuickScheduleError('');
    setQuickCreatedMeeting(null);
    setQuickCopyStatus('');
  };

  const submitQuickSchedule = async () => {
    if (!quickScheduleForm) {
      return;
    }

    const startDate = new Date(`${quickScheduleForm.date}T${quickScheduleForm.startTime}`);
    const durationMinutes = Number(quickScheduleForm.durationMinutes);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const attendeeEmails = parseAttendees(quickScheduleForm.attendeeText);

    if (!quickScheduleForm.title.trim()) {
      setQuickScheduleError('Meeting title is required');
      return;
    }

    if (Number.isNaN(startDate.getTime()) || startDate < new Date(Date.now() - 60000)) {
      setQuickScheduleError('Choose a valid future start time');
      return;
    }

    if (hasMeetingConflict(meetings, startDate, durationMinutes)) {
      setQuickScheduleError('You already have a meeting in this time range.');
      return;
    }

    setQuickScheduleSaving(true);
    setQuickScheduleError('');
    setQuickCopyStatus('');

    try {
      const response = await meetingAPI.createMeeting({
        title: quickScheduleForm.title.trim(),
        description: quickScheduleForm.description.trim(),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes,
        attendeeEmails,
        location: quickScheduleForm.location.trim(),
        isOnlineMeeting: quickScheduleForm.isOnlineMeeting,
        lobbyEnabled: quickScheduleForm.lobbyEnabled,
        allowChat: quickScheduleForm.allowChat,
        allowReactions: true,
        allowScreenShare: true,
        allowAttendeeUnmute: true,
        allowRecording: quickScheduleForm.allowRecording,
        allowTranscription: false,
        recurrenceRule: quickScheduleForm.recurrenceRule,
        maxParticipants: 100,
        isRecorded: false,
      });
      addMeeting(response.data);
      setQuickCreatedMeeting(response.data);
      addNotification({ message: `${response.data.title} was scheduled`, meetingId: response.data.id });
      showBrowserMeetingNotification(response.data);
    } catch (err: any) {
      setQuickScheduleError(err.response?.data?.message || err.response?.data || 'Failed to create meeting');
    } finally {
      setQuickScheduleSaving(false);
    }
  };

  const copyQuickJoinLink = async () => {
    if (!quickCreatedMeeting) {
      return;
    }

    const joinLink = getMeetingJoinUrl(quickCreatedMeeting.id, quickCreatedMeeting.meetingLink);
    try {
      await navigator.clipboard.writeText(joinLink);
      setQuickCopyStatus('Copied');
    } catch {
      setQuickCopyStatus('Unable to copy');
    }
  };

  const openMeetingDetails = (calendarMeeting: Meeting) => {
    const sourceMeeting = meetings.find((meeting) => meeting.id === calendarMeeting.id) || calendarMeeting;
    setSelectedMeeting(sourceMeeting);
    setMeetingEditForm(toEditMeetingForm(sourceMeeting));
    setMeetingEditMode(false);
    setMeetingModalError('');
    setMeetingCopyStatus('');
  };

  const closeMeetingDetails = () => {
    setSelectedMeeting(null);
    setMeetingEditForm(null);
    setMeetingEditMode(false);
    setMeetingModalError('');
    setMeetingCopyStatus('');
  };

  const updateMeetingEditForm = (updates: Partial<EditMeetingForm>) => {
    setMeetingEditForm((current) => current ? { ...current, ...updates } : current);
    setMeetingModalError('');
    setMeetingCopyStatus('');
  };

  const copyMeetingJoinLink = async () => {
    if (!selectedMeeting) {
      return;
    }

    try {
      await navigator.clipboard.writeText(getJoinLink(selectedMeeting));
      setMeetingCopyStatus('Copied');
    } catch {
      setMeetingCopyStatus('Unable to copy');
    }
  };

  const saveMeetingChanges = async () => {
    if (!selectedMeeting || !meetingEditForm) {
      return;
    }

    const startDate = new Date(`${meetingEditForm.date}T${meetingEditForm.startTime}`);
    const durationMinutes = Number(meetingEditForm.durationMinutes);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

    if (!meetingEditForm.title.trim()) {
      setMeetingModalError('Meeting title is required');
      return;
    }

    if (Number.isNaN(startDate.getTime()) || startDate < new Date(Date.now() - 60000)) {
      setMeetingModalError('Choose a valid future start time');
      return;
    }

    if (hasMeetingConflict(meetings, startDate, durationMinutes, selectedMeeting.id)) {
      setMeetingModalError('You already have a meeting in this time range.');
      return;
    }

    setMeetingSaving(true);
    setMeetingModalError('');

    try {
      const response = await meetingAPI.updateMeeting(selectedMeeting.id, {
        title: meetingEditForm.title.trim(),
        description: meetingEditForm.description.trim(),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes,
        attendeeEmails: parseAttendees(meetingEditForm.attendeeText),
        location: meetingEditForm.location.trim(),
        isOnlineMeeting: meetingEditForm.isOnlineMeeting,
        lobbyEnabled: meetingEditForm.lobbyEnabled,
        allowChat: meetingEditForm.allowChat,
        allowReactions: meetingEditForm.allowReactions,
        allowScreenShare: meetingEditForm.allowScreenShare,
        allowAttendeeUnmute: meetingEditForm.allowAttendeeUnmute,
        allowRecording: meetingEditForm.allowRecording,
        allowTranscription: meetingEditForm.allowTranscription,
        recurrenceRule: meetingEditForm.recurrenceRule,
        maxParticipants: Number(meetingEditForm.maxParticipants),
      });
      setMeetings(meetings.map((meeting) => meeting.id === selectedMeeting.id ? response.data : meeting));
      setSelectedMeeting(response.data);
      setMeetingEditForm(toEditMeetingForm(response.data));
      setMeetingEditMode(false);
      addNotification({ message: `${response.data.title} was updated`, meetingId: response.data.id });
    } catch (err: any) {
      setMeetingModalError(err.response?.data?.message || err.response?.data || 'Failed to update meeting');
    } finally {
      setMeetingSaving(false);
    }
  };

  const rescheduleMeeting = async (calendarMeeting: Meeting, nextStart: Date) => {
    const sourceMeeting = meetings.find((meeting) => meeting.id === calendarMeeting.id) || calendarMeeting;
    const durationMinutes = getMeetingDurationMinutes(calendarMeeting);
    const nextEnd = new Date(nextStart.getTime() + durationMinutes * 60000);

    if (Number.isNaN(nextStart.getTime()) || nextStart < new Date(Date.now() - 60000)) {
      window.alert('Choose a valid future start time.');
      return;
    }

    if (hasMeetingConflict(meetings, nextStart, durationMinutes, sourceMeeting.id)) {
      window.alert('You already have a meeting in this time range.');
      return;
    }

    try {
      const response = await meetingAPI.updateMeeting(sourceMeeting.id, {
        title: sourceMeeting.title,
        description: sourceMeeting.description || '',
        startTime: nextStart.toISOString(),
        endTime: nextEnd.toISOString(),
        durationMinutes,
        attendeeEmails: sourceMeeting.attendeeEmails || [],
        location: sourceMeeting.location || '',
        isOnlineMeeting: sourceMeeting.isOnlineMeeting,
        lobbyEnabled: sourceMeeting.lobbyEnabled,
        allowChat: sourceMeeting.allowChat,
        allowReactions: sourceMeeting.allowReactions,
        allowScreenShare: sourceMeeting.allowScreenShare,
        allowAttendeeUnmute: sourceMeeting.allowAttendeeUnmute,
        allowRecording: sourceMeeting.allowRecording,
        allowTranscription: sourceMeeting.allowTranscription,
        recurrenceRule: sourceMeeting.recurrenceRule || '',
        maxParticipants: sourceMeeting.maxParticipants || 100,
      });

      updateMeetingInStore(sourceMeeting.id, response.data);
      if (selectedMeeting?.id === sourceMeeting.id) {
        setSelectedMeeting(response.data);
        setMeetingEditForm(toEditMeetingForm(response.data));
      }
      addNotification({ message: `${response.data.title} moved to ${formatDateTime(nextStart)}`, meetingId: response.data.id });
    } catch (err: any) {
      const message = err.response?.data?.message || err.response?.data || 'Failed to move meeting';
      setNotices((items) => [message, ...items].slice(0, 3));
      window.alert(message);
    }
  };

  const cancelSelectedMeeting = async () => {
    if (!selectedMeeting) {
      return;
    }

    setMeetingSaving(true);
    setMeetingModalError('');

    try {
      await meetingAPI.deleteMeeting(selectedMeeting.id);
      setMeetings(meetings.filter((meeting) => meeting.id !== selectedMeeting.id));
      addNotification({ message: `${selectedMeeting.title} was cancelled`, meetingId: selectedMeeting.id });
      closeMeetingDetails();
    } catch (err: any) {
      setMeetingModalError(err.response?.data?.message || err.response?.data || 'Failed to cancel meeting');
    } finally {
      setMeetingSaving(false);
    }
  };

  const moveWeek = (offset: number) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (calendarRange === 'month') {
        next.setMonth(current.getMonth() + offset);
      } else {
        next.setDate(current.getDate() + offset * 7);
      }
      return next;
    });
  };

  return (
    <AppShell
      active="calendar"
      title="Samvaad"
      subtitle="Calendar"
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
          onSignOut={handleLogout}
        />
      )}
    >
      <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-slate-100 px-6 py-5">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(getOrganizationScopedPath('/create-meeting'))}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              New meeting
            </button>
            <button
              onClick={() => navigate(getOrganizationScopedPath('/chat'))}
              className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Chat
            </button>
            <button
              onClick={() => setDashboardView(dashboardView === 'recordings' ? 'calendar' : 'recordings')}
              className={`rounded-md border px-5 py-2 text-sm font-semibold ${
                dashboardView === 'recordings'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Recordings
            </button>
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((value) => !value)}
                className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Notifications {notifications.length > 0 ? `(${notifications.length})` : ''}
              </button>
              {notificationsOpen && (
                <div className="absolute left-0 z-40 mt-2 w-80 rounded-md border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-950">Notifications</p>
                    <button onClick={() => setNotifications([])} className="text-xs font-semibold text-slate-500 hover:text-slate-950">Clear</button>
                  </div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-slate-500">No notifications yet.</p>
                    ) : (
                      notifications.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.meetingId) {
                              const meeting = meetings.find((entry) => entry.id === item.meetingId);
                              if (meeting) {
                                openMeetingDetails(meeting);
                              }
                            }
                            setNotificationsOpen(false);
                          }}
                          className="w-full rounded-md bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                        >
                          <p className="font-medium text-slate-800">{item.message}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatTime(item.time)}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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

          {dashboardView === 'calendar' && view === 'calendar' && (
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
                onChange={(event) => setCalendarRange(event.target.value as 'workWeek' | 'week' | 'month')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="workWeek">Work week</option>
                <option value="week">Full week</option>
                <option value="month">Month</option>
              </select>
            </div>
          )}
        </div>

        <CalendarSyncPanel />

        {notices.length > 0 && (
          <div className="mb-6 space-y-2">
            {notices.map((notice, index) => (
              <div key={`${notice}-${index}`} className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <span>{notice}</span>
                {sortedMeetings[0] && (
                  <button
                    onClick={() => openMeetingJoinInNewTab(sortedMeetings[0].id, sortedMeetings[0].meetingLink)}
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
        ) : dashboardView === 'recordings' ? (
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Recordings</h2>
                <p className="text-sm text-slate-500">Saved meeting recordings from your meetings.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {recordingMeetings.length}
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recordingMeetings.length === 0 ? (
                <p className="text-sm text-slate-500">No recordings yet.</p>
              ) : (
                recordingMeetings.map((meeting) => (
                  <div key={meeting.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-950">{meeting.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{formatDate(meeting.startTime)} at {formatTime(meeting.startTime)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={getRecordingLink(meeting)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Open recording
                      </a>
                      <button
                        onClick={() => openMeetingDetails(meeting)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : view === 'calendar' ? (
          calendarRange === 'month' ? (
            <MonthCalendar
              days={weekDays}
              selectedDate={selectedDate}
              meetingsByDay={meetingsByDay}
              onMeetingClick={openMeetingDetails}
              onTimeSlotClick={openQuickSchedule}
            />
          ) : (
            <TimeGridCalendar
              days={weekDays}
              meetingsByDay={meetingsByDay}
              onMeetingClick={openMeetingDetails}
              onTimeSlotClick={openQuickSchedule}
              onMeetingReschedule={rescheduleMeeting}
            />
          )
        ) : meetings.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white py-12 text-center">
            <p className="mb-4 text-slate-500">You haven't created any meetings yet.</p>
            <button
              onClick={() => navigate(getOrganizationScopedPath('/create-meeting'))}
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
      </div>

      {quickScheduleForm && (
        <QuickScheduleModal
          form={quickScheduleForm}
          error={quickScheduleError}
          saving={quickScheduleSaving}
          createdMeeting={quickCreatedMeeting}
          copyStatus={quickCopyStatus}
          users={knownUsers}
          onChange={updateQuickScheduleForm}
          onClose={closeQuickSchedule}
          onSubmit={submitQuickSchedule}
          onCopy={copyQuickJoinLink}
          onJoin={(meeting) => openMeetingJoinInNewTab(meeting.id, meeting.meetingLink)}
        />
      )}
      {selectedMeeting && meetingEditForm && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          editForm={meetingEditForm}
          users={knownUsers}
          editMode={meetingEditMode}
          saving={meetingSaving}
          error={meetingModalError}
          copyStatus={meetingCopyStatus}
          onClose={closeMeetingDetails}
          onJoin={() => openMeetingJoinInNewTab(selectedMeeting.id, selectedMeeting.meetingLink)}
          onCopy={copyMeetingJoinLink}
          onEdit={() => setMeetingEditMode(true)}
          onEditChange={updateMeetingEditForm}
          onSave={saveMeetingChanges}
          onCancelEdit={() => {
            setMeetingEditForm(toEditMeetingForm(selectedMeeting));
            setMeetingEditMode(false);
            setMeetingModalError('');
          }}
          onCancelMeeting={cancelSelectedMeeting}
        />
      )}
    </AppShell>
  );
}
