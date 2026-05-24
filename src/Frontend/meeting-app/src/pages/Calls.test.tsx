import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import Calls from './Calls';

const apiMocks = vi.hoisted(() => ({
  getRecentCallLogs: vi.fn(),
  markCallSeen: vi.fn(),
  hideCallLog: vi.fn(),
  clearCallLogs: vi.fn(),
  openUrlInNewTab: vi.fn(),
}));

vi.mock('../components/AppShell', () => ({
  default: ({ title, actions, children }: any) => (
    <div>
      <header>
        <h1>{title}</h1>
        {actions}
      </header>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock('../services/api', () => ({
  meetingAPI: {
    getRecentCallLogs: apiMocks.getRecentCallLogs,
    markCallSeen: apiMocks.markCallSeen,
    hideCallLog: apiMocks.hideCallLog,
    clearCallLogs: apiMocks.clearCallLogs,
  },
  getMeetingJoinUrl: (meetingId: string, _meetingLink?: string, query = '') =>
    `http://localhost:5173/meeting/${meetingId}${query ? `?${query}` : ''}`,
  getOrganizationScopedPath: (path: string) => `/org/acme${path}`,
  openUrlInNewTab: apiMocks.openUrlInNewTab,
}));

const calls = [
  {
    id: 'call-1',
    meetingId: 'meeting-1',
    meetingTitle: 'Daily standup',
    conversationId: 'chat-1',
    callerUserId: 'user-2',
    callerName: 'Alex Benton',
    recipientUserId: 'user-1',
    recipientEmail: 'asha@samvaad.test',
    recipientName: 'Asha Mehta',
    callType: 'video',
    status: 'NoResponse',
    isSeen: false,
    createdAt: '2026-05-20T08:00:00.000Z',
  },
  {
    id: 'call-2',
    meetingId: 'meeting-2',
    meetingTitle: 'Design review',
    conversationId: 'chat-2',
    callerUserId: 'user-1',
    callerName: 'Asha Mehta',
    recipientUserId: 'user-3',
    recipientEmail: 'priya@samvaad.test',
    recipientName: 'Priya Nair',
    callType: 'audio',
    status: 'Accepted',
    isSeen: true,
    joinUrl: 'http://localhost:5173/meeting/meeting-2?call=audio',
    createdAt: '2026-05-20T09:00:00.000Z',
  },
];

describe('Calls page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    apiMocks.getRecentCallLogs.mockResolvedValue({ data: calls });
    apiMocks.markCallSeen.mockResolvedValue({ data: { ...calls[0], isSeen: true } });
    apiMocks.hideCallLog.mockResolvedValue({ data: null });
    apiMocks.clearCallLogs.mockResolvedValue({ data: null });
  });

  it('loads call history and shows missed and unseen counts', async () => {
    render(<Calls />, { wrapper: MemoryRouter });

    expect(await screen.findByText('Alex Benton')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText('1 missed, 1 unseen')).toBeInTheDocument();
    expect(apiMocks.getRecentCallLogs).toHaveBeenCalledWith('All');
  });

  it('filters calls by status', async () => {
    const user = userEvent.setup();
    render(<Calls />, { wrapper: MemoryRouter });

    await screen.findByText('Alex Benton');
    await user.click(screen.getByRole('button', { name: 'Missed' }));

    await waitFor(() => expect(apiMocks.getRecentCallLogs).toHaveBeenLastCalledWith('Missed'));
  });

  it('marks visible calls as seen and clears visible history', async () => {
    const user = userEvent.setup();
    render(<Calls />, { wrapper: MemoryRouter });

    await screen.findByText('Alex Benton');
    await user.click(screen.getByRole('button', { name: 'Mark shown seen' }));
    expect(apiMocks.markCallSeen).toHaveBeenCalledWith('call-1');

    await user.click(screen.getByRole('button', { name: 'Clear shown' }));
    expect(apiMocks.clearCallLogs).toHaveBeenCalledWith('All');
    expect(screen.getByText('Call history cleared')).toBeInTheDocument();
  });

  it('opens call back links in a new tab and marks the call seen first', async () => {
    const user = userEvent.setup();
    render(<Calls />, { wrapper: MemoryRouter });

    await screen.findByText('Alex Benton');
    await user.click(screen.getAllByRole('button', { name: 'Call back' })[0]);

    expect(apiMocks.markCallSeen).toHaveBeenCalledWith('call-1');
    expect(apiMocks.openUrlInNewTab).toHaveBeenCalledWith('http://localhost:5173/meeting/meeting-1?call=video&autojoin=1');
  });
});
