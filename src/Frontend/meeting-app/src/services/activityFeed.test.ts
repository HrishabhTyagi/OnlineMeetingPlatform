import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredMissedCall,
  clearStoredMissedCalls,
  missedCallStorageKey,
  readStoredMissedCalls,
  writeStoredMissedCalls,
  type StoredMissedCall,
} from './activityFeed';

function missedCall(meetingId: string): StoredMissedCall {
  return {
    callLogId: `call-${meetingId}`,
    conversationId: `chat-${meetingId}`,
    meetingId,
    callerUserId: 'caller-1',
    callerName: 'Alex Benton',
    callType: 'video',
    joinUrl: `http://localhost:5173/meeting/${meetingId}`,
    timestamp: '2026-05-20T10:00:00.000Z',
    missedAt: '2026-05-20T10:00:30.000Z',
  };
}

describe('activity feed missed call storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list without a user or when stored data is invalid', () => {
    expect(readStoredMissedCalls()).toEqual([]);

    localStorage.setItem(missedCallStorageKey('user-1'), '{not-json');
    expect(readStoredMissedCalls('user-1')).toEqual([]);
  });

  it('stores at most the five newest missed calls and emits a change event', () => {
    const listener = vi.fn();
    window.addEventListener('samvaad-activity-changed', listener);

    writeStoredMissedCalls('user-1', [
      missedCall('meeting-1'),
      missedCall('meeting-2'),
      missedCall('meeting-3'),
      missedCall('meeting-4'),
      missedCall('meeting-5'),
      missedCall('meeting-6'),
    ]);

    const stored = readStoredMissedCalls('user-1');
    expect(stored).toHaveLength(5);
    expect(stored.map((call) => call.meetingId)).toEqual([
      'meeting-1',
      'meeting-2',
      'meeting-3',
      'meeting-4',
      'meeting-5',
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('samvaad-activity-changed', listener);
  });

  it('clears one missed call or all missed calls for a user', () => {
    writeStoredMissedCalls('user-1', [missedCall('meeting-1'), missedCall('meeting-2')]);

    const remaining = clearStoredMissedCall('user-1', 'meeting-1');
    expect(remaining.map((call) => call.meetingId)).toEqual(['meeting-2']);

    clearStoredMissedCalls('user-1');
    expect(localStorage.getItem(missedCallStorageKey('user-1'))).toBeNull();
  });
});
