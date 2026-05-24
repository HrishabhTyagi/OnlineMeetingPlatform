import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import IncomingCallRinger from './IncomingCallRinger';

const signalRMox = vi.hoisted(() => ({
  initializeSignalR: vi.fn(),
  startSignalR: vi.fn(),
  joinUserNotifications: vi.fn(),
  onIncomingCall: vi.fn(),
  onIncomingCallCancelled: vi.fn(),
  sendIncomingCallResponse: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  updateCallLog: vi.fn(),
  openUrlInNewTab: vi.fn(),
}));

let incomingCallHandler: ((data: any) => void) | undefined;
let cancelledCallHandler: ((data: any) => void) | undefined;

vi.mock('../services/signalR', () => ({
  initializeSignalR: signalRMox.initializeSignalR,
  startSignalR: signalRMox.startSignalR,
  joinUserNotifications: signalRMox.joinUserNotifications,
  onIncomingCall: (callback: (data: any) => void) => {
    incomingCallHandler = callback;
    signalRMox.onIncomingCall(callback);
  },
  onIncomingCallCancelled: (callback: (data: any) => void) => {
    cancelledCallHandler = callback;
    signalRMox.onIncomingCallCancelled(callback);
  },
  sendIncomingCallResponse: signalRMox.sendIncomingCallResponse,
}));

vi.mock('../services/api', () => ({
  meetingAPI: {
    updateCallLog: apiMocks.updateCallLog,
  },
  getMeetingJoinUrl: (meetingId: string, _meetingLink?: string, query = '') =>
    `http://localhost:5173/meeting/${meetingId}${query}`,
  getOrganizationScopedPath: (path: string) => `/org/acme${path}`,
  openUrlInNewTab: apiMocks.openUrlInNewTab,
}));

describe('IncomingCallRinger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    incomingCallHandler = undefined;
    cancelledCallHandler = undefined;
    signalRMox.startSignalR.mockResolvedValue(undefined);
    signalRMox.joinUserNotifications.mockResolvedValue(undefined);
    signalRMox.sendIncomingCallResponse.mockResolvedValue(undefined);
    apiMocks.updateCallLog.mockResolvedValue({ data: {} });
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'asha@samvaad.test',
        firstName: 'Asha',
        lastName: 'Mehta',
        isEmailVerified: true,
        createdAt: '2026-05-20T00:00:00.000Z',
      },
      token: 'token',
      accounts: [],
      isAuthenticated: true,
    });
  });

  it('rings the signed-in user and opens accepted calls in a new tab', async () => {
    const user = userEvent.setup();
    render(<IncomingCallRinger />, { wrapper: MemoryRouter });

    await waitFor(() => expect(signalRMox.joinUserNotifications).toHaveBeenCalledWith('user-1'));
    act(() => {
      incomingCallHandler?.({
        callLogId: 'call-1',
        conversationId: 'chat-1',
        meetingId: 'meeting-1',
        callerUserId: 'user-2',
        callerName: 'Alex Benton',
        callType: 'video',
        joinUrl: 'http://localhost:5173/meeting/meeting-1',
        timestamp: '2026-05-20T10:00:00.000Z',
      });
    });

    expect(await screen.findByText('Incoming video call')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(apiMocks.updateCallLog).toHaveBeenCalledWith('meeting-1', 'call-1', {
      status: 'Accepted',
      reason: 'Accepted',
    }));
    expect(signalRMox.sendIncomingCallResponse).toHaveBeenCalledWith(
      'chat-1',
      'meeting-1',
      'call-1',
      'user-2',
      'user-1',
      'Asha Mehta',
      'Accepted',
      'Accepted',
    );
    expect(apiMocks.openUrlInNewTab).toHaveBeenCalledWith('http://localhost:5173/meeting/meeting-1?call=video&autojoin=1');
  });

  it('stores a missed call when a no-response cancellation arrives', async () => {
    render(<IncomingCallRinger />, { wrapper: MemoryRouter });

    await waitFor(() => expect(signalRMox.onIncomingCallCancelled).toHaveBeenCalled());
    act(() => {
      incomingCallHandler?.({
        callLogId: 'call-2',
        conversationId: 'chat-2',
        meetingId: 'meeting-2',
        callerUserId: 'user-3',
        callerName: 'Priya Nair',
        callType: 'audio',
        joinUrl: 'http://localhost:5173/meeting/meeting-2',
        timestamp: '2026-05-20T11:00:00.000Z',
      });
    });
    act(() => {
      cancelledCallHandler?.({
        conversationId: 'chat-2',
        meetingId: 'meeting-2',
        callerUserId: 'user-3',
        callerName: 'Priya Nair',
        reason: 'NoResponse',
        timestamp: '2026-05-20T11:00:30.000Z',
      });
    });

    expect(await screen.findByText('Missed call')).toBeInTheDocument();
    expect(localStorage.getItem('missedCalls:user-1')).toContain('meeting-2');
  });
});
