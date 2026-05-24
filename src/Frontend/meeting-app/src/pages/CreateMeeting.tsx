import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { UserAvatar, UserStatusBadge } from '../components/UserStatus';
import { getActiveOrganization, getMeetingJoinUrl, getOrganizationScopedPath, meetingAPI, openUrlInNewTab, organizationAPI, userAPI } from '../services/api';
import { useMeetingStore } from '../store/meetingStore';

const durationOptions = [15, 30, 45, 60, 90, 120, 180];
const recurrenceOptions = [
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

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseAttendees(value: string) {
  return value
    .split(/[\n,;]/)
    .map((email) => email.trim())
    .filter(Boolean);
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

function recurrenceLabel(rule?: string) {
  return recurrenceOptions.find((option) => option.value === rule)?.label || 'Does not repeat';
}

function findUserByEmail(users: UserSummary[], email: string) {
  return users.find((item) => item.email.toLowerCase() === email.toLowerCase());
}

function notifyMeetingCreated(title: string, joinLink: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(`Meeting scheduled: ${title}`, {
    body: 'Your join link is ready. Click to open the meeting.',
    tag: `scheduled-${joinLink}`,
  });

  notification.onclick = () => {
    window.focus();
    openUrlInNewTab(joinLink);
  };
}

export default function CreateMeeting() {
  const navigate = useNavigate();
  const addMeeting = useMeetingStore((state) => state.addMeeting);
  const now = new Date();
  now.setMinutes(now.getMinutes() + (30 - (now.getMinutes() % 30 || 30)));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [knownUsers, setKnownUsers] = useState<UserSummary[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    attendeeText: '',
    date: toDateInputValue(now),
    startTime: toTimeInputValue(now),
    durationMinutes: 60,
    recurrenceRule: '',
    location: '',
    isOnlineMeeting: true,
    isRecorded: false,
    lobbyEnabled: true,
    allowChat: true,
    allowReactions: true,
    allowScreenShare: true,
    allowAttendeeUnmute: true,
    allowRecording: false,
    allowTranscription: false,
    maxParticipants: 100,
    description: '',
  });

  const attendeeEmails = useMemo(() => parseAttendees(formData.attendeeText), [formData.attendeeText]);
  const startDate = useMemo(
    () => new Date(`${formData.date}T${formData.startTime}`),
    [formData.date, formData.startTime],
  );
  const endDate = useMemo(
    () => new Date(startDate.getTime() + Number(formData.durationMinutes) * 60000),
    [startDate, formData.durationMinutes],
  );

  useEffect(() => {
    userAPI.searchUsers()
      .then((response) => setKnownUsers(response.data))
      .catch(() => setKnownUsers([]));

    if (getActiveOrganization()) {
      organizationAPI.getCurrent()
        .then((response) => {
          setFormData((current) => ({
            ...current,
            lobbyEnabled: response.data.requireLobbyByDefault ?? current.lobbyEnabled,
            allowRecording: response.data.enableRecordingByDefault ?? current.allowRecording,
          }));
        })
        .catch(() => undefined);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim()) {
      setError('Meeting title is required');
      return;
    }

    if (Number.isNaN(startDate.getTime()) || startDate < new Date(Date.now() - 60000)) {
      setError('Choose a valid future start time');
      return;
    }

    setLoading(true);

    try {
      const response = await meetingAPI.createMeeting({
        title: formData.title.trim(),
        description: formData.description.trim(),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes: Number(formData.durationMinutes),
        attendeeEmails,
        location: formData.location.trim(),
        isOnlineMeeting: formData.isOnlineMeeting,
        lobbyEnabled: formData.lobbyEnabled,
        allowChat: formData.allowChat,
        allowReactions: formData.allowReactions,
        allowScreenShare: formData.allowScreenShare,
        allowAttendeeUnmute: formData.allowAttendeeUnmute,
        allowRecording: formData.allowRecording,
        allowTranscription: formData.allowTranscription,
        recurrenceRule: formData.recurrenceRule,
        maxParticipants: Number(formData.maxParticipants),
        isRecorded: formData.isRecorded,
      });
      addMeeting(response.data);
      notifyMeetingCreated(response.data.title, getMeetingJoinUrl(response.data.id, response.data.meetingLink));
      navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() - startDate.getDay() + index);
    return day;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <BrandMark showName={false} markClassName="h-11 w-11" />
            <div>
              <p className="text-sm font-medium text-blue-700">Samvaad calendar</p>
              <h1 className="text-2xl font-semibold text-slate-950">New meeting</h1>
            </div>
          </div>
          <button
            onClick={() => navigate(getOrganizationScopedPath('/dashboard'))}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Add a title"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Required attendees</label>
            <textarea
              name="attendeeText"
              value={formData.attendeeText}
              onChange={handleChange}
              placeholder="name@example.com, teammate@example.com"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {attendeeEmails.length > 0 && (
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {attendeeEmails.map((email) => {
                  const attendee = findUserByEmail(knownUsers, email);
                  return (
                    <div key={email} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
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
                        <span className="min-w-0 truncate">{attendee?.fullName || email}</span>
                      </span>
                      {attendee ? (
                        <UserStatusBadge status={attendee.status} />
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">External invite</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_160px_160px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Start</label>
              <input
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleChange}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Duration</label>
              <select
                name="durationMinutes"
                value={formData.durationMinutes}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {durationOptions.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration < 60 ? `${duration} min` : `${duration / 60} hr${duration > 60 ? 's' : ''}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Meeting type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  name="isOnlineMeeting"
                  checked={formData.isOnlineMeeting}
                  onChange={handleChange}
                  className="h-4 w-4"
                />
                <span className="text-sm text-slate-700">Online meeting</span>
              </label>
              <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  name="isRecorded"
                  checked={formData.isRecorded}
                  onChange={handleChange}
                  className="h-4 w-4"
                />
                <span className="text-sm text-slate-700">Record automatically</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Meeting options</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['lobbyEnabled', 'Use lobby'],
                ['allowChat', 'Allow chat'],
                ['allowReactions', 'Allow reactions'],
                ['allowScreenShare', 'Allow screen sharing'],
                ['allowAttendeeUnmute', 'Allow attendees to unmute'],
                ['allowRecording', 'Allow recording'],
                ['allowTranscription', 'Allow transcription'],
              ].map(([name, label]) => (
                <label key={name} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <input
                    type="checkbox"
                    name={name}
                    checked={Boolean(formData[name as keyof typeof formData])}
                    onChange={handleChange}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="Room, office, or link"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Repeat</label>
              <select
                name="recurrenceRule"
                value={formData.recurrenceRule}
                onChange={handleChange}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {recurrenceOptions.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Capacity</label>
              <input
                type="number"
                name="maxParticipants"
                value={formData.maxParticipants}
                onChange={handleChange}
                min="2"
                max="1000"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Agenda</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Add agenda, notes, or preparation details"
              rows={5}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={() => navigate(getOrganizationScopedPath('/dashboard'))}
              className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>

        <aside className="space-y-5">
          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Schedule preview</h2>
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-950">{formData.title || 'Untitled meeting'}</p>
              <p className="mt-2 text-sm text-blue-900">{formatDateTime(startDate)}</p>
              <p className="text-sm text-blue-900">Ends {formatDateTime(endDate)}</p>
              <p className="mt-2 text-sm text-blue-900">{recurrenceLabel(formData.recurrenceRule)}</p>
              <p className="mt-3 text-sm text-blue-900">
                {attendeeEmails.length} attendee{attendeeEmails.length === 1 ? '' : 's'}
              </p>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="space-y-1">
                  <div>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</div>
                  <div
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${
                      toDateInputValue(day) === formData.date ? 'bg-blue-600 text-white' : 'text-slate-700'
                    }`}
                  >
                    {day.getDate()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {[8, 10, 12, 14, 16].map((hour) => {
                const isSelectedHour = startDate.getHours() === hour;
                return (
                  <div key={hour} className="grid grid-cols-[52px_1fr] items-center gap-3 text-sm">
                    <span className="text-slate-500">{pad(hour)}:00</span>
                    <div className="h-px bg-slate-200" />
                    {isSelectedHour && (
                      <>
                        <span />
                        <div className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white">
                          {formData.title || 'New meeting'}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
