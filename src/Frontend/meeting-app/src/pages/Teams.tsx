import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { conversationAPI, openMeetingJoinInNewTab, teamSpaceAPI, userAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
}

interface TeamMember {
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
}

interface TeamChannelTab {
  id: string;
  teamChannelId: string;
  title: string;
  kind: string;
  url?: string;
  content?: string;
}

interface TeamChannel {
  id: string;
  teamSpaceId: string;
  conversationId: string;
  name: string;
  description?: string;
  tabs: TeamChannelTab[];
}

interface TeamSpace {
  id: string;
  name: string;
  description?: string;
  members: TeamMember[];
  channels: TeamChannel[];
}

interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  message: string;
  attachmentFileName?: string;
  attachmentUrl?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
  sentAt: string;
}

interface TeamChannelFile {
  messageId: string;
  conversationId: string;
  fileName: string;
  url?: string;
  contentType?: string;
  sizeBytes?: number;
  senderName: string;
  sentAt: string;
}

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  meetingLink?: string;
}

function displayUser(user: UserSummary) {
  return user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function formatTime(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes?: number) {
  if (!bytes) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeMessage(value: string) {
  return value.replace(/\s+$/, '');
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M21 11.5 12.1 20.4a6 6 0 0 1-8.5-8.5l9.3-9.3a4 4 0 1 1 5.7 5.7L9.2 17.7a2 2 0 0 1-2.8-2.8l8.5-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="m4 5 16 7-16 7 3-7-3-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 12h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h7A2.5 2.5 0 0 1 17 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 10 3.5-2v8L17 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Teams() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const user = useAuthStore((state) => state.user);
  const [teams, setTeams] = useState<TeamSpace[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'meetings' | 'tabs'>('chat');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [files, setFiles] = useState<TeamChannelFile[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [channelName, setChannelName] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [tabTitle, setTabTitle] = useState('');
  const [tabUrl, setTabUrl] = useState('');
  const [tabKind, setTabKind] = useState('Link');
  const [tabContent, setTabContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const selectedChannel = selectedTeam?.channels.find((channel) => channel.id === selectedChannelId) || null;
  const selectedUsers = users.filter((item) => selectedUserIds.includes(item.id));
  const selectableUsers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    const existingMemberIds = new Set(selectedTeam?.members.map((member) => member.userId) || []);
    return users
      .filter((item) => item.id !== user?.id && !existingMemberIds.has(item.id))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return displayUser(item).toLowerCase().includes(query) || item.email.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [memberQuery, selectedTeam, user?.id, users]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const load = async () => {
      try {
        const [teamResponse, userResponse] = await Promise.all([
          teamSpaceAPI.getTeams(),
          userAPI.searchUsers(),
        ]);
        const nextTeams = teamResponse.data as TeamSpace[];
        setTeams(nextTeams);
        setUsers(userResponse.data);
        setSelectedTeamId(nextTeams[0]?.id || null);
        setSelectedChannelId(nextTeams[0]?.channels[0]?.id || null);
        setError('');
      } catch {
        setError('Unable to load spaces');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, user]);

  useEffect(() => {
    if (!selectedChannel) {
      setMessages([]);
      setFiles([]);
      setMeetings([]);
      return;
    }

    conversationAPI.getMessages(selectedChannel.conversationId)
      .then((response) => setMessages(response.data))
      .catch(() => setError('Unable to load channel messages'));
    teamSpaceAPI.getFiles(selectedChannel.id)
      .then((response) => setFiles(response.data))
      .catch(() => undefined);
    teamSpaceAPI.getMeetings(selectedChannel.id)
      .then((response) => setMeetings(response.data))
      .catch(() => undefined);
  }, [selectedChannel?.id, selectedChannel?.conversationId]);

  const createTeam = async () => {
    if (!user || saving || !teamName.trim()) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await teamSpaceAPI.createTeam({
        name: teamName,
        description: teamDescription,
        members: selectedUsers.map((item) => ({
          userId: item.id,
          userEmail: item.email,
          userName: displayUser(item),
        })),
      });
      const team = response.data as TeamSpace;
      setTeams((items) => [team, ...items.filter((item) => item.id !== team.id)]);
      setSelectedTeamId(team.id);
      setSelectedChannelId(team.channels[0]?.id || null);
      setTeamName('');
      setTeamDescription('');
      setSelectedUserIds([]);
      setMemberQuery('');
      setStatus('Team created.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create team');
    } finally {
      setSaving(false);
    }
  };

  const createChannel = async () => {
    if (!selectedTeam || saving || !channelName.trim()) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await teamSpaceAPI.createChannel(selectedTeam.id, { name: channelName });
      const channel = response.data as TeamChannel;
      setTeams((items) => items.map((team) => (
        team.id === selectedTeam.id ? { ...team, channels: [...team.channels, channel] } : team
      )));
      setSelectedChannelId(channel.id);
      setChannelName('');
      setStatus('Channel created.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create channel');
    } finally {
      setSaving(false);
    }
  };

  const addMembers = async () => {
    if (!selectedTeam || selectedUsers.length === 0 || saving) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await teamSpaceAPI.addMembers(selectedTeam.id, {
        members: selectedUsers.map((item) => ({
          userId: item.id,
          userEmail: item.email,
          userName: displayUser(item),
        })),
      });
      const updatedTeam = response.data as TeamSpace;
      setTeams((items) => items.map((team) => (team.id === updatedTeam.id ? updatedTeam : team)));
      setSelectedUserIds([]);
      setMemberQuery('');
      setStatus('Members added.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to add members');
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedChannel || saving) {
      return;
    }

    const text = normalizeMessage(messageDraft);
    if (!text.trim()) {
      return;
    }

    setSaving(true);
    try {
      const response = await conversationAPI.sendMessage(selectedChannel.conversationId, {
        senderId: user.id,
        senderName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        message: text,
      });
      setMessages((items) => [...items, response.data]);
      setMessageDraft('');
      setError('');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to send channel message');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user || !selectedChannel || !event.target.files?.[0]) {
      return;
    }

    const file = event.target.files[0];
    event.target.value = '';
    const data = new FormData();
    data.append('senderId', user.id);
    data.append('senderName', `${user.firstName} ${user.lastName}`.trim() || user.email);
    data.append('message', messageDraft.trim());
    data.append('file', file);

    setSaving(true);
    try {
      const response = await conversationAPI.uploadAttachment(selectedChannel.conversationId, data);
      setMessages((items) => [...items, response.data]);
      setMessageDraft('');
      const fileResponse = await teamSpaceAPI.getFiles(selectedChannel.id);
      setFiles(fileResponse.data);
      setStatus('File shared.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to upload file');
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = async (file: TeamChannelFile) => {
    if (!file.url) {
      return;
    }

    const response = await conversationAPI.downloadAttachment(file.url);
    const blob = new Blob([response.data], { type: file.contentType || 'application/octet-stream' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const createMeeting = async () => {
    if (!selectedChannel || saving) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await teamSpaceAPI.createMeeting(selectedChannel.id, {
        title: `${selectedChannel.name} meeting`,
        startTime: new Date().toISOString(),
        durationMinutes: 60,
      });
      const meeting = response.data as Meeting;
      setMeetings((items) => [meeting, ...items]);
      conversationAPI.getMessages(selectedChannel.conversationId)
        .then((messageResponse) => setMessages(messageResponse.data))
        .catch(() => undefined);
      setStatus('Channel meeting created.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create channel meeting');
    } finally {
      setSaving(false);
    }
  };

  const createTab = async () => {
    if (!selectedChannel || saving || !tabTitle.trim()) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await teamSpaceAPI.createTab(selectedChannel.id, {
        title: tabTitle,
        kind: tabKind,
        url: tabUrl,
        content: tabContent,
      });
      const tab = response.data as TeamChannelTab;
      setTeams((items) => items.map((team) => ({
        ...team,
        channels: team.channels.map((channel) => (
          channel.id === selectedChannel.id ? { ...channel, tabs: [...channel.tabs, tab] } : channel
        )),
      })));
      setTabTitle('');
      setTabUrl('');
      setTabContent('');
      setStatus('Tab added.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to add tab');
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectedUser = (id: string) => {
    setSelectedUserIds((items) => (
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    ));
  };

  return (
    <AppShell active="teams" title="Spaces" subtitle="Samvaad">
      <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] gap-3 bg-transparent p-3">
        <aside className="min-h-0 overflow-y-auto rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Spaces</h2>
            <button
              type="button"
              onClick={createTeam}
              disabled={saving || !teamName.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              title="Create space"
              aria-label="Create space"
            >
              <PlusIcon />
            </button>
          </div>

          <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Space name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
            <textarea
              value={teamDescription}
              onChange={(event) => setTeamDescription(event.target.value)}
              placeholder="Description"
              rows={2}
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
            />
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="rounded-md bg-white p-3 text-sm text-slate-500">Loading spaces...</p>
            ) : teams.length === 0 ? (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Create your first shared space.</p>
            ) : teams.map((team) => (
              <div key={team.id} className="rounded-md border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setSelectedChannelId(team.channels[0]?.id || null);
                  }}
                  className={`w-full px-3 py-3 text-left ${selectedTeamId === team.id ? 'bg-teal-50' : 'hover:bg-white'}`}
                >
                  <p className="truncate font-semibold text-slate-950">{team.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{team.members.length} members</p>
                </button>
                {selectedTeamId === team.id && (
                  <div className="border-t border-slate-100 px-3 py-2">
                    {team.channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                          selectedChannelId === channel.id ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'
                        }`}
                      >
                        <span className="text-slate-400">#</span>
                        <span className="truncate">{channel.name}</span>
                      </button>
                    ))}
                    <div className="mt-2 flex gap-2">
                      <input
                        value={channelName}
                        onChange={(event) => setChannelName(event.target.value)}
                        placeholder="New channel"
                        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={createChannel}
                        disabled={saving || !channelName.trim()}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-teal-700 ring-1 ring-slate-300 hover:bg-teal-50 disabled:opacity-50"
                        title="Add channel"
                        aria-label="Add channel"
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">{selectedTeam?.name || 'Space'}</p>
                <h2 className="truncate text-2xl font-semibold text-slate-950">
                  {selectedChannel ? `# ${selectedChannel.name}` : 'Select a channel'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{selectedChannel?.description || selectedTeam?.description || 'Keep conversations, files, meetings, and useful tabs together.'}</p>
              </div>
              {selectedTeam && (
                <div className="w-full max-w-sm rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex gap-2">
                    <input
                      value={memberQuery}
                      onChange={(event) => setMemberQuery(event.target.value)}
                      placeholder="Add people"
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={addMembers}
                      disabled={saving || selectedUserIds.length === 0}
                      className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  {selectedUserIds.length > 0 && <p className="mt-2 text-xs text-teal-700">{selectedUsers.map(displayUser).join(', ')}</p>}
                  {memberQuery && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white">
                      {selectableUsers.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => toggleSelectedUser(candidate.id)}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedUserIds.includes(candidate.id) ? 'bg-teal-50 text-teal-700' : ''}`}
                        >
                          <span className="block font-medium">{displayUser(candidate)}</span>
                          <span className="text-xs text-slate-500">{candidate.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              {(['chat', 'files', 'meetings', 'tabs'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold capitalize ${
                    activeTab === tab ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </header>

          {error && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">{error}</div>}
          {status && (
            <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-sm text-emerald-700">
              {status}
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            {!selectedChannel ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Select or create a channel.</div>
            ) : activeTab === 'chat' ? (
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500">Start this channel conversation.</p>
                ) : messages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  return (
                    <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[720px] rounded-md px-4 py-3 text-sm ${isMine ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-900'}`}>
                        <div className={`mb-1 flex gap-2 text-xs ${isMine ? 'text-teal-100' : 'text-slate-500'}`}>
                          <span className="font-semibold">{message.senderName}</span>
                          <span>{formatTime(message.sentAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words">{message.message}</p>
                        {message.attachmentFileName && (
                          <p className="mt-2 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold">{message.attachmentFileName}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTab === 'files' ? (
              <div className="space-y-3">
                {files.length === 0 ? (
                  <p className="text-sm text-slate-500">No files shared in this channel yet.</p>
                ) : files.map((file) => (
                  <div key={file.messageId} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{file.fileName}</p>
                      <p className="text-xs text-slate-500">{file.senderName} - {formatFileSize(file.sizeBytes)} - {formatTime(file.sentAt)}</p>
                    </div>
                    <button onClick={() => downloadFile(file)} className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700">Download</button>
                  </div>
                ))}
              </div>
            ) : activeTab === 'meetings' ? (
              <div>
                <button
                  type="button"
                  onClick={createMeeting}
                  disabled={saving}
                  className="mb-4 inline-flex items-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  <VideoIcon />
                  Meet now
                </button>
                <div className="space-y-3">
                  {meetings.length === 0 ? (
                    <p className="text-sm text-slate-500">No channel meetings yet.</p>
                  ) : meetings.map((meeting) => (
                    <div key={meeting.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-950">{meeting.title}</p>
                        <p className="text-sm text-slate-500">{formatTime(meeting.startTime)}</p>
                      </div>
                      <button onClick={() => openMeetingJoinInNewTab(meeting.id, meeting.meetingLink)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Join</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                  {selectedChannel.tabs.length === 0 ? (
                    <p className="text-sm text-slate-500">Add useful tabs for notes, links, files, and meetings.</p>
                  ) : selectedChannel.tabs.map((tab) => (
                    <div key={tab.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{tab.title}</p>
                          <p className="text-xs font-medium text-teal-700">{tab.kind}</p>
                        </div>
                        {tab.url && <a href={tab.url} target="_blank" rel="noreferrer" className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-teal-700 ring-1 ring-slate-200">Open</a>}
                      </div>
                      {tab.content && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{tab.content}</p>}
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-950">Add tab</h3>
                  <div className="mt-3 space-y-2">
                    <input value={tabTitle} onChange={(event) => setTabTitle(event.target.value)} placeholder="Title" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none" />
                    <select value={tabKind} onChange={(event) => setTabKind(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none">
                      <option value="Link">Link</option>
                      <option value="Notes">Notes</option>
                      <option value="Files">Files</option>
                      <option value="Meetings">Meetings</option>
                    </select>
                    <input value={tabUrl} onChange={(event) => setTabUrl(event.target.value)} placeholder="URL for link tabs" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none" />
                    <textarea value={tabContent} onChange={(event) => setTabContent(event.target.value)} placeholder="Notes" rows={4} className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none" />
                    <button onClick={createTab} disabled={saving || !tabTitle.trim()} className="w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">Add tab</button>
                  </div>
                </div>
              </div>
            )}
          </main>

          {selectedChannel && activeTab === 'chat' && (
            <footer className="border-t border-slate-200 bg-white px-6 py-4">
              <input ref={fileInputRef} type="file" className="hidden" onChange={uploadFile} />
              <div className="flex items-end gap-2 rounded-md border border-slate-300 px-3 py-2">
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={`Message #${selectedChannel.name}`}
                  rows={Math.min(5, Math.max(1, messageDraft.split('\n').length))}
                  className="max-h-36 min-w-0 flex-1 resize-none border-0 px-1 py-1 text-sm outline-none"
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={saving} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50" title="Attach file" aria-label="Attach file">
                  <PaperclipIcon />
                </button>
                <button type="button" onClick={sendMessage} disabled={saving || !messageDraft.trim()} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50" title="Send" aria-label="Send">
                  <SendIcon />
                </button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </AppShell>
  );
}
