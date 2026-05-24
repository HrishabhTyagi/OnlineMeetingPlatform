export interface StoredMissedCall {
  callLogId?: string;
  conversationId: string;
  meetingId: string;
  callerUserId: string;
  callerName: string;
  callType: 'audio' | 'video';
  joinUrl: string;
  timestamp: string;
  missedAt: string;
}

const MAX_MISSED_CALLS = 5;

export function missedCallStorageKey(userId: string) {
  return `missedCalls:${userId}`;
}

export function readStoredMissedCalls(userId?: string | null): StoredMissedCall[] {
  if (!userId) {
    return [];
  }

  try {
    const value = localStorage.getItem(missedCallStorageKey(userId));
    return value ? JSON.parse(value) as StoredMissedCall[] : [];
  } catch {
    return [];
  }
}

export function writeStoredMissedCalls(userId: string, calls: StoredMissedCall[]) {
  localStorage.setItem(missedCallStorageKey(userId), JSON.stringify(calls.slice(0, MAX_MISSED_CALLS)));
  window.dispatchEvent(new CustomEvent('samvaad-activity-changed'));
}

export function clearStoredMissedCall(userId: string, meetingId: string) {
  const nextCalls = readStoredMissedCalls(userId).filter((call) => call.meetingId !== meetingId);
  writeStoredMissedCalls(userId, nextCalls);
  return nextCalls;
}

export function clearStoredMissedCalls(userId: string) {
  localStorage.removeItem(missedCallStorageKey(userId));
  window.dispatchEvent(new CustomEvent('samvaad-activity-changed'));
}
