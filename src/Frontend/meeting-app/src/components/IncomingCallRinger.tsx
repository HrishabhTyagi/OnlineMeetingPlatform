import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  initializeSignalR,
  joinUserNotifications,
  onIncomingCall,
  onIncomingCallCancelled,
  startSignalR,
} from '../services/signalR';
import { getMeetingJoinUrl, getOrganizationScopedPath, openUrlInNewTab } from '../services/api';
import { readStoredMissedCalls, writeStoredMissedCalls, type StoredMissedCall } from '../services/activityFeed';

interface IncomingCall {
  conversationId: string;
  meetingId: string;
  callerUserId: string;
  callerName: string;
  callType: 'audio' | 'video';
  joinUrl: string;
  timestamp: string;
}

interface CancelledCallNotice {
  id: string;
  conversationId: string;
  meetingId: string;
  callerUserId: string;
  callerName: string;
  message: string;
  timestamp: string;
}

const RING_TIMEOUT_MS = 30_000;
const CANCELLED_NOTICE_TIMEOUT_MS = 8_000;
const MAX_MISSED_CALLS = 5;

function normalizeIncomingCall(data: any): IncomingCall {
  return {
    conversationId: data.conversationId || data.ConversationId || '',
    meetingId: data.meetingId || data.MeetingId || '',
    callerUserId: data.callerUserId || data.CallerUserId || '',
    callerName: data.callerName || data.CallerName || 'Someone',
    callType: (data.callType || data.CallType) === 'video' ? 'video' : 'audio',
    joinUrl: data.joinUrl || data.JoinUrl || '',
    timestamp: data.timestamp || data.Timestamp || new Date().toISOString(),
  };
}

function normalizeCancelledCall(data: any): CancelledCallNotice {
  const meetingId = data.meetingId || data.MeetingId || '';
  const callerUserId = data.callerUserId || data.CallerUserId || '';
  const timestamp = data.timestamp || data.Timestamp || new Date().toISOString();

  return {
    id: `${meetingId}-${callerUserId}-${timestamp}`,
    conversationId: data.conversationId || data.ConversationId || '',
    meetingId,
    callerUserId,
    callerName: data.callerName || data.CallerName || 'Someone',
    message: data.message || data.Message || 'Sorry, I called you by mistake.',
    timestamp,
  };
}

function resolveJoinUrl(joinUrl: string, meetingId: string, callType: 'audio' | 'video') {
  const fallbackQuery = `?call=${callType}&autojoin=1`;
  if (!joinUrl.trim()) {
    return getMeetingJoinUrl(meetingId, undefined, fallbackQuery);
  }

  try {
    const url = new URL(joinUrl, window.location.origin);
    if (!url.search) {
      url.search = fallbackQuery;
    }

    return url.toString();
  } catch {
    return getMeetingJoinUrl(meetingId, undefined, fallbackQuery);
  }
}

function formatMissedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function IncomingCallRinger() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [missedCalls, setMissedCalls] = useState<StoredMissedCall[]>([]);
  const [cancelledNotices, setCancelledNotices] = useState<CancelledCallNotice[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const persistMissedCalls = useCallback((nextCalls: StoredMissedCall[]) => {
    if (user?.id) {
      writeStoredMissedCalls(user.id, nextCalls);
    }
  }, [user?.id]);

  const addMissedCall = useCallback((call: IncomingCall) => {
    const missedCall: StoredMissedCall = {
      ...call,
      missedAt: new Date().toISOString(),
    };

    setMissedCalls((items) => {
      const nextCalls = [
        missedCall,
        ...items.filter((item) => item.meetingId !== call.meetingId),
      ].slice(0, MAX_MISSED_CALLS);
      persistMissedCalls(nextCalls);
      return nextCalls;
    });
  }, [persistMissedCalls]);

  const dismissMissedCall = useCallback((meetingId: string) => {
    setMissedCalls((items) => {
      const nextCalls = items.filter((item) => item.meetingId !== meetingId);
      persistMissedCalls(nextCalls);
      return nextCalls;
    });
  }, [persistMissedCalls]);

  useEffect(() => {
    setMissedCalls(user?.id ? readStoredMissedCalls(user.id) : []);
  }, [user?.id]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        await joinUserNotifications(user.id);
        onIncomingCall((data) => {
          const call = normalizeIncomingCall(data);
          if (!call.meetingId || call.callerUserId === user.id) {
            return;
          }

          setIncomingCall(call);
        });
        onIncomingCallCancelled((data) => {
          const notice = normalizeCancelledCall(data);
          if (!notice.meetingId || notice.callerUserId === user.id) {
            return;
          }

          setIncomingCall((current) => (
            current
              && current.meetingId === notice.meetingId
              && current.callerUserId === notice.callerUserId
              ? null
              : current
          ));
          setMissedCalls((items) => {
            const nextCalls = items.filter((item) => !(
              item.meetingId === notice.meetingId
              && item.callerUserId === notice.callerUserId
            ));
            persistMissedCalls(nextCalls);
            return nextCalls;
          });
          setCancelledNotices((items) => [notice, ...items.filter((item) => item.id !== notice.id)].slice(0, 3));
          window.setTimeout(() => {
            setCancelledNotices((items) => items.filter((item) => item.id !== notice.id));
          }, CANCELLED_NOTICE_TIMEOUT_MS);
        });
      })
      .catch((error) => console.warn('Incoming call connection failed', error));
  }, [persistMissedCalls, token, user]);

  useEffect(() => {
    if (!incomingCall) {
      return;
    }

    const missedTimer = window.setTimeout(() => {
      addMissedCall(incomingCall);
      setIncomingCall(null);
    }, RING_TIMEOUT_MS);
    let disposed = false;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const context = audioContextRef.current || (AudioContextClass ? new AudioContextClass() : null);
    audioContextRef.current = context;

    const playTone = async () => {
      if (!context || disposed) {
        return;
      }

      try {
        if (context.state === 'suspended') {
          await context.resume();
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.36);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.4);
      } catch {
        // Browsers can block sound until the user has interacted with the page.
      }
    };

    playTone();
    const interval = window.setInterval(playTone, 1200);
    return () => {
      disposed = true;
      window.clearTimeout(missedTimer);
      window.clearInterval(interval);
    };
  }, [addMissedCall, incomingCall]);

  if (!incomingCall && missedCalls.length === 0 && cancelledNotices.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3 text-slate-950">
      {incomingCall && (
        <div className="rounded-md border border-indigo-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">
              {incomingCall.callerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Incoming {incomingCall.callType === 'video' ? 'video call' : 'call'}</p>
              <h2 className="mt-1 truncate text-lg font-semibold">{incomingCall.callerName}</h2>
              <p className="mt-1 text-sm text-slate-600">Ringing now</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIncomingCall(null)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => {
                const call = incomingCall;
                setIncomingCall(null);
                openUrlInNewTab(resolveJoinUrl(call.joinUrl, call.meetingId, call.callType));
              }}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {cancelledNotices.map((notice) => (
        <div key={notice.id} className="rounded-md border border-amber-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
              {notice.callerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Call cancelled</p>
              <h2 className="mt-1 truncate text-base font-semibold">{notice.callerName}</h2>
              <p className="mt-1 text-sm text-slate-600">{notice.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setCancelledNotices((items) => items.filter((item) => item.id !== notice.id))}
              className="rounded px-2 py-1 text-sm font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss cancelled call"
            >
              x
            </button>
          </div>
        </div>
      ))}

      {missedCalls.map((call) => (
        <div key={call.meetingId} className="rounded-md border border-rose-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">
              {call.callerName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Missed {call.callType === 'video' ? 'video call' : 'call'}</p>
              <h2 className="mt-1 truncate text-base font-semibold">{call.callerName}</h2>
              <p className="mt-1 text-sm text-slate-600">{formatMissedAt(call.missedAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => dismissMissedCall(call.meetingId)}
              className="rounded px-2 py-1 text-sm font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss missed call"
            >
              x
            </button>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dismissMissedCall(call.meetingId)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                dismissMissedCall(call.meetingId);
                navigate(getOrganizationScopedPath(`/chat?conversationId=${call.conversationId}`));
              }}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Open chat
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
