import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import {
  getMeetingJoinUrl,
  getOrganizationScopedPath,
  meetingAPI,
  openUrlInNewTab,
} from '../services/api';
import { useAuthStore } from '../store/authStore';

type CallFilter = 'All' | 'Missed' | 'Accepted' | 'Declined' | 'Cancelled' | 'NoResponse';

interface CallLog {
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

const filters: Array<{ id: CallFilter; label: string }> = [
  { id: 'All', label: 'All' },
  { id: 'Missed', label: 'Missed' },
  { id: 'Accepted', label: 'Accepted' },
  { id: 'Declined', label: 'Declined' },
  { id: 'Cancelled', label: 'Cancelled' },
  { id: 'NoResponse', label: 'No response' },
];

function PhoneIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7.2 4.5 9.4 9l-1.7 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-1.7 4.5 2.2v2.9c0 .8-.7 1.5-1.5 1.5A15.2 15.2 0 0 1 2.8 6c0-.8.7-1.5 1.5-1.5h2.9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
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

function statusText(status: CallLog['status'], incoming: boolean) {
  if (status === 'NoResponse') {
    return incoming ? 'Missed' : 'No response';
  }

  return status;
}

function statusClass(status: CallLog['status'], incoming: boolean) {
  if (status === 'Accepted') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  }

  if (status === 'Cancelled') {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  if (status === 'Declined' || status === 'Failed' || (status === 'NoResponse' && incoming)) {
    return 'bg-rose-50 text-rose-700 ring-rose-100';
  }

  return 'bg-amber-50 text-amber-700 ring-amber-100';
}

export default function Calls() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [filter, setFilter] = useState<CallFilter>('All');
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionStatus, setActionStatus] = useState('');

  const loadCalls = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const response = await meetingAPI.getRecentCallLogs(nextFilter);
      setCalls(response.data);
    } catch (err: any) {
      setError(err.response?.data || 'Unable to load call history');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadCalls(filter);
  }, [filter, loadCalls]);

  const counts = useMemo(() => {
    const missed = calls.filter((call) => call.status === 'NoResponse' && call.recipientUserId === user?.id).length;
    const unread = calls.filter((call) => !call.isSeen).length;
    return { missed, unread };
  }, [calls, user?.id]);

  const markSeen = async (call: CallLog) => {
    setCalls((items) => items.map((item) => item.id === call.id ? { ...item, isSeen: true } : item));
    await meetingAPI.markCallSeen(call.id).catch(() => undefined);
  };

  const hideCall = async (call: CallLog) => {
    setCalls((items) => items.filter((item) => item.id !== call.id));
    await meetingAPI.hideCallLog(call.id).catch(() => setActionStatus('Unable to clear call'));
  };

  const clearCurrent = async () => {
    setActionStatus('Clearing...');
    try {
      await meetingAPI.clearCallLogs(filter);
      setCalls([]);
      setActionStatus('Call history cleared');
    } catch (err: any) {
      setActionStatus(err.response?.data || 'Unable to clear call history');
    }
  };

  const markShownSeen = async () => {
    const unseenCalls = calls.filter((call) => !call.isSeen);
    if (unseenCalls.length === 0) {
      setActionStatus('No unseen calls in this view');
      return;
    }

    setCalls((items) => items.map((item) => ({ ...item, isSeen: true })));
    setActionStatus('Marking calls seen...');
    await Promise.all(unseenCalls.map((call) => meetingAPI.markCallSeen(call.id).catch(() => undefined)));
    setActionStatus('Shown calls marked seen');
  };

  const openCallBack = async (call: CallLog) => {
    await markSeen(call);
    openUrlInNewTab(call.joinUrl || getMeetingJoinUrl(call.meetingId, undefined, `call=${call.callType || 'video'}&autojoin=1`));
  };

  const openChat = async (call: CallLog) => {
    await markSeen(call);
    if (call.conversationId && !call.conversationId.startsWith('meeting-')) {
      navigate(`${getOrganizationScopedPath('/chat')}?conversationId=${encodeURIComponent(call.conversationId)}`);
      return;
    }

    navigate(getOrganizationScopedPath(`/meeting/${call.meetingId}`));
  };

  return (
    <AppShell
      active="calls"
      title="Calls"
      subtitle="Samvaad"
      actions={(
        <button
          type="button"
          onClick={() => loadCalls(filter)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      )}
    >
      <div className="flex h-full min-h-0 flex-col bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Call history</h2>
              <p className="mt-1 text-sm text-slate-500">
                {counts.missed} missed, {counts.unread} unseen
              </p>
            </div>
            <button
              type="button"
              onClick={markShownSeen}
              disabled={calls.every((call) => call.isSeen)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark shown seen
            </button>
            <button
              type="button"
              onClick={clearCurrent}
              disabled={calls.length === 0}
              className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear shown
            </button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  filter === item.id
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {actionStatus && <p className="mt-3 text-sm font-medium text-slate-600">{actionStatus}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading calls...</div>
          ) : error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>
          ) : calls.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <PhoneIcon className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700">No calls found</p>
                <p className="mt-1 text-sm text-slate-500">Calls you make or receive will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {calls.map((call) => {
                const incoming = call.recipientUserId === user?.id;
                const otherName = incoming ? call.callerName : call.recipientName;
                const otherEmail = incoming ? '' : call.recipientEmail;
                const canCallBack = call.status === 'NoResponse' || call.status === 'Declined' || call.status === 'Accepted';

                return (
                  <div
                    key={call.id}
                    className={`rounded-md border bg-white p-4 shadow-sm transition ${
                      call.isSeen ? 'border-slate-200' : 'border-indigo-200 ring-2 ring-indigo-50'
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          incoming ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'
                        }`}>
                          <PhoneIcon />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-slate-950">{otherName}</h3>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(call.status, incoming)}`}>
                              {statusText(call.status, incoming)}
                            </span>
                            {!call.isSeen && <span className="rounded-full bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">New</span>}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {incoming ? 'Incoming' : 'Outgoing'} {call.callType} call - {formatDateTime(call.createdAt)}
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {call.meetingTitle || 'Meeting'}{call.meetingStartTime ? ` - ${formatDateTime(call.meetingStartTime)}` : ''}
                          </p>
                          {otherEmail && <p className="mt-1 truncate text-xs text-slate-400">{otherEmail}</p>}
                          {call.cancellationMessage && (
                            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{call.cancellationMessage}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {!call.isSeen && (
                          <button
                            type="button"
                            onClick={() => markSeen(call)}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Mark seen
                          </button>
                        )}
                        {canCallBack && (
                          <button
                            type="button"
                            onClick={() => openCallBack(call)}
                            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                          >
                            Call back
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openChat(call)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open context
                        </button>
                        <button
                          type="button"
                          onClick={() => hideCall(call)}
                          className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
