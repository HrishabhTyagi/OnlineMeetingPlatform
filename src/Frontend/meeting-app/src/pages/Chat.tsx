import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileStatusMenu, UserStatusBadge, UserStatus } from '../components/UserStatus';
import { conversationAPI, userAPI } from '../services/api';
import {
  initializeSignalR,
  joinConversation,
  joinUserNotifications,
  leaveConversation,
  notifyUserStatusChanged,
  onConversationMessageReceived,
  onUserStatusChanged,
  sendConversationMessage,
  startSignalR,
} from '../services/signalR';
import { useAuthStore } from '../store/authStore';

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  status?: string;
}

interface ConversationMember {
  userId: string;
  userEmail: string;
  userName: string;
}

interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  message: string;
  sentAt: string;
}

interface ConversationInvite {
  id: string;
  email: string;
  hasAccepted: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  type: 'Direct' | 'Group';
  title?: string;
  members: ConversationMember[];
  invites?: ConversationInvite[];
  lastMessage?: ConversationMessage;
  createdAt: string;
  updatedAt?: string;
}

function displayUser(user: UserSummary) {
  return user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function formatMessageTime(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function Chat() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const displayName = useMemo(() => {
    if (!user) {
      return 'User';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  const selectedPeople = users.filter((item) => selectedUserIds.includes(item.id));
  const normalizedQuery = userQuery.trim().toLowerCase();
  const canAddEmailInvite = isEmail(userQuery)
    && !inviteEmails.some((email) => email.toLowerCase() === normalizedQuery)
    && !users.some((item) => item.email.toLowerCase() === normalizedQuery);
  const recipientCount = selectedUserIds.length + inviteEmails.length;

  const getUserStatus = (userId?: string) => {
    if (!userId) {
      return 'Offline';
    }

    if (statusOverrides[userId]) {
      return statusOverrides[userId];
    }

    if (user?.id === userId) {
      return user.status || 'Available';
    }

    return users.find((item) => item.id === userId)?.status || 'Available';
  };

  const refreshConversations = async () => {
    const response = await conversationAPI.getConversations();
    setConversations(response.data);
    return response.data as Conversation[];
  };

  const selectedTitle = useMemo(() => {
    if (!selectedConversation || !user) {
      return 'Select a chat';
    }

    if (selectedConversation.type === 'Group') {
      return selectedConversation.title || 'Group chat';
    }

    return selectedConversation.members.find((member) => member.userId !== user.id)?.userName
      || selectedConversation.invites?.find((invite) => !invite.hasAccepted)?.email
      || 'Direct chat';
  }, [selectedConversation, user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const load = async () => {
      try {
        const [conversationResponse, userResponse, profileResponse] = await Promise.all([
          conversationAPI.getConversations(),
          userAPI.searchUsers(),
          userAPI.getProfile().catch(() => ({ data: user })),
        ]);
        setError('');
        setConversations(conversationResponse.data);
        setUsers(userResponse.data);
        if (profileResponse.data) {
          setUser(profileResponse.data);
        }
        setSelectedConversationId(conversationResponse.data[0]?.id || null);
      } catch {
        setError('Unable to load chats');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate, user?.id, setUser]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        await joinUserNotifications(user.id);
        onUserStatusChanged((data) => {
          setStatusOverrides((items) => ({ ...items, [data.userId]: data.status }));
          setUsers((items) => items.map((item) => (
            item.id === data.userId ? { ...item, status: data.status } : item
          )));

          if (data.userId === user.id) {
            setUser({ ...user, status: data.status });
          }
        });
        onConversationMessageReceived((data) => {
          if (data.senderId === user.id) {
            return;
          }

          const incoming: ConversationMessage = {
            id: `${data.conversationId}-${data.senderId}-${data.timestamp}`,
            conversationId: data.conversationId,
            senderId: data.senderId,
            senderName: data.senderName,
            message: data.message,
            sentAt: data.timestamp,
          };

          setConversations((items) => {
            const hasConversation = items.some((conversation) => conversation.id === data.conversationId);
            if (!hasConversation) {
              refreshConversations().catch(() => undefined);
              return items;
            }

            return items.map((conversation) => (
              conversation.id === data.conversationId
                ? { ...conversation, lastMessage: incoming, updatedAt: data.timestamp }
                : conversation
            ));
          });

          setMessages((items) => {
            if (selectedConversationId !== data.conversationId || items.some((message) => message.id === incoming.id)) {
              return items;
            }

            return [...items, incoming];
          });
        });
      })
      .catch((err) => console.warn('Chat SignalR connection failed', err));
  }, [selectedConversationId, token, user, setUser]);

  const handleStatusChange = async (status: UserStatus) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    setUser({ ...user, status });

    try {
      const response = await userAPI.updateStatus(status);
      setUser(response.data);
      await notifyUserStatusChanged(user.id, displayName, response.data.status).catch(() => undefined);
    } catch {
      setUser(previousUser);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    conversations.forEach((conversation) => {
      joinConversation(conversation.id).catch(() => undefined);
    });

    return () => {
      conversations.forEach((conversation) => {
        leaveConversation(conversation.id).catch(() => undefined);
      });
    };
  }, [conversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    joinConversation(selectedConversationId).catch(() => undefined);

    conversationAPI.getMessages(selectedConversationId)
      .then((response) => setMessages(response.data))
      .catch(() => setError('Unable to load messages'));

    return () => {
      leaveConversation(selectedConversationId).catch(() => undefined);
    };
  }, [selectedConversationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      userAPI.searchUsers(userQuery)
        .then((response) => setUsers(response.data))
        .catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [userQuery]);

  const createConversation = async () => {
    if (!user || recipientCount === 0) {
      return;
    }

    setRequestStatus('Sending request...');
    const selectedUsers = users.filter((item) => selectedUserIds.includes(item.id));
    const members = [
      {
        userId: user.id,
        userEmail: user.email,
        userName: displayName,
      },
      ...selectedUsers.map((item) => ({
        userId: item.id,
        userEmail: item.email,
        userName: displayUser(item),
      })),
    ];

    try {
      const response = await conversationAPI.createConversation({
        type: mode === 'group' ? 'Group' : 'Direct',
        title: mode === 'group' ? groupTitle || 'Group chat' : null,
        members,
        inviteEmails,
      });
      setConversations((items) => {
        const exists = items.some((conversation) => conversation.id === response.data.id);
        return exists ? items : [response.data, ...items];
      });
      setSelectedConversationId(response.data.id);
      setSelectedUserIds([]);
      setInviteEmails([]);
      setGroupTitle('');
      setUserQuery('');
      setError('');
      setRequestStatus('Request sent. Chat is ready.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create chat');
      setRequestStatus('');
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedConversation || !messageDraft.trim()) {
      return;
    }

    const text = messageDraft.trim();
    setMessageDraft('');

    const response = await conversationAPI.sendMessage(selectedConversation.id, {
      senderId: user.id,
      senderName: displayName,
      message: text,
    });

    setMessages((items) => [...items, response.data]);
    setConversations((items) => items.map((conversation) => (
      conversation.id === selectedConversation.id
        ? { ...conversation, lastMessage: response.data, updatedAt: response.data.sentAt }
        : conversation
    )));
    await sendConversationMessage(
      selectedConversation.id,
      user.id,
      displayName,
      text,
      selectedConversation.members.filter((member) => member.userId !== user.id).map((member) => member.userId),
    );
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((items) => {
      if (mode === 'direct') {
        setInviteEmails([]);
        return items.includes(id) ? [] : [id];
      }

      return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
    });
  };

  const addEmailInvite = () => {
    if (!canAddEmailInvite) {
      return;
    }

    setInviteEmails((items) => {
      if (mode === 'direct') {
        setSelectedUserIds([]);
        return [userQuery.trim()];
      }

      return [...items, userQuery.trim()];
    });
    setUserQuery('');
    setRequestStatus('');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-medium text-blue-700">Chat</p>
            <h1 className="text-2xl font-semibold">Messages</h1>
          </div>
          <div className="flex items-center gap-2">
            <ProfileStatusMenu
              displayName={displayName}
              email={user?.email}
              status={user?.status}
              onChange={handleStatusChange}
              onSignOut={handleSignOut}
            />
            <button onClick={() => navigate('/dashboard')} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Calendar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold">Chats</h2>
          </div>
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading chats...</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No chats yet.</p>
            ) : (
              conversations.map((conversation) => {
                const title = conversation.type === 'Group'
                  ? conversation.title || 'Group chat'
                  : conversation.members.find((member) => member.userId !== user?.id)?.userName
                    || conversation.invites?.find((invite) => !invite.hasAccepted)?.email
                    || 'Direct chat';
                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      selectedConversationId === conversation.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {conversation.type === 'Direct' && (
                          <UserStatusBadge
                            status={getUserStatus(conversation.members.find((member) => member.userId !== user?.id)?.userId)}
                            compact
                          />
                        )}
                        <p className="truncate text-sm font-semibold">{title}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatMessageTime(conversation.lastMessage?.sentAt || conversation.updatedAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">{conversation.lastMessage?.message || `${conversation.members.length} member chat`}</p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="flex min-h-[calc(100vh-150px)] flex-col rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold">{selectedTitle}</h2>
            {selectedConversation && (
              <div className="mt-1 flex flex-wrap gap-2">
                {selectedConversation.members.map((member) => (
                  <span key={member.userId} className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <UserStatusBadge status={getUserStatus(member.userId)} compact />
                    {member.userName}
                  </span>
                ))}
                {(selectedConversation.invites || [])
                  .filter((invite) => !invite.hasAccepted)
                  .map((invite) => (
                    <span key={invite.id} className="text-sm text-slate-500">{invite.email} pending</span>
                  ))}
              </div>
            )}
          </div>

          {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Choose or create a chat.</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Start the conversation.</div>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === user?.id;
                return (
                  <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-md px-3 py-2 text-sm ${isMine ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 shadow-sm'}`}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-75">
                        <span>{isMine ? 'You' : message.senderName}</span>
                        <span>{formatMessageTime(message.sentAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{message.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="flex gap-2">
              <input
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={!selectedConversation}
                placeholder={selectedConversation ? 'Type a message' : 'Select a chat first'}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
              <button
                onClick={sendMessage}
                disabled={!selectedConversation || !messageDraft.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">New chat</h2>
          <div className="mt-3 rounded-md border border-slate-300 bg-white p-1">
            <button
              onClick={() => {
                setMode('direct');
                setSelectedUserIds([]);
                setInviteEmails([]);
                setRequestStatus('');
              }}
              className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'direct' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              Direct
            </button>
            <button
              onClick={() => {
                setMode('group');
                setSelectedUserIds([]);
                setInviteEmails([]);
                setRequestStatus('');
              }}
              className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'group' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              Group
            </button>
          </div>

          {mode === 'group' && (
            <input
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
              placeholder="Group name"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          )}

          <input
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Search people"
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {users.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">No registered users found.</p>
                {canAddEmailInvite && (
                  <button
                    onClick={addEmailInvite}
                    className="w-full rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-800 hover:bg-blue-100"
                  >
                    Add email invite: {userQuery.trim()}
                  </button>
                )}
              </div>
            ) : (
              users.map((item) => {
                const isSelected = selectedUserIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      toggleUser(item.id);
                      setRequestStatus('');
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{displayUser(item)}</p>
                          <UserStatusBadge status={getUserStatus(item.id)} />
                        </div>
                        <p className="text-xs text-slate-500">{item.email}</p>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedPeople.length > 0 && (
            <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Sending to {selectedPeople.map(displayUser).join(', ')}
            </div>
          )}

          {inviteEmails.length > 0 && (
            <div className="mt-3 space-y-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Pending email invite{inviteEmails.length === 1 ? '' : 's'}</p>
              {inviteEmails.map((email) => (
                <div key={email} className="flex items-center justify-between gap-2">
                  <span className="truncate">{email}</span>
                  <button
                    onClick={() => setInviteEmails((items) => items.filter((item) => item !== email))}
                    className="font-semibold text-amber-900 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={createConversation}
            disabled={recipientCount === 0 || (mode === 'direct' && recipientCount !== 1)}
            className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {requestStatus === 'Sending request...' ? 'Sending...' : 'Send chat request'}
          </button>
          {requestStatus && requestStatus !== 'Sending request...' && (
            <p className="mt-2 text-sm font-medium text-emerald-700">{requestStatus}</p>
          )}
        </section>
      </main>
    </div>
  );
}
