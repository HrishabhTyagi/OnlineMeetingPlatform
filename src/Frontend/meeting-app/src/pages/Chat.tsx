import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileStatusMenu, UserAvatar, UserStatusBadge, UserStatus } from '../components/UserStatus';
import { conversationAPI, meetingAPI, resolveApiAssetUrl, userAPI } from '../services/api';
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
  profilePictureUrl?: string;
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
  attachmentFileName?: string;
  attachmentUrl?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
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

function formatConversationDate(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) {
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

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function describeLastMessage(message: ConversationMessage | undefined, memberCount: number) {
  if (!message) {
    return `${memberCount} member chat`;
  }

  if (message.attachmentFileName && message.message) {
    return `${message.message} - ${message.attachmentFileName}`;
  }

  if (message.attachmentFileName) {
    return `Shared ${message.attachmentFileName}`;
  }

  return message.message;
}

function isImageAttachment(message: ConversationMessage) {
  return !!message.attachmentUrl && !!message.attachmentContentType?.startsWith('image/');
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : value;
}

function looksLikeCode(value: string) {
  const lines = value.split('\n');
  if (lines.length < 2) {
    return false;
  }

  return lines.some((line) => /^\s*(#include|using\s|import\s|function\s|class\s|public\s|private\s|const\s|let\s|var\s|if\s*\(|for\s*\(|while\s*\(|return\b|int\s+main|printf|<\/?\w|[{};])/.test(line))
    || lines.some((line) => /^\s{2,}\S/.test(line));
}

function linkifyMessageText(value: string, isMine: boolean) {
  return value.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part.startsWith('http')) {
      return part;
    }

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-semibold underline underline-offset-2 ${isMine ? 'text-white' : 'text-blue-700'}`}
      >
        {part}
      </a>
    );
  });
}

function FormattedMessage({ message, isMine }: { message: string; isMine: boolean }) {
  if (looksLikeCode(message) || message.trim().startsWith('```')) {
    return (
      <pre className={`mt-1 max-h-96 overflow-auto rounded-md border px-3 py-2 text-left font-mono text-xs leading-relaxed ${isMine ? 'border-white/20 bg-blue-700 text-white' : 'border-slate-200 bg-slate-950 text-slate-100'}`}>
        <code className="whitespace-pre">{stripCodeFence(message)}</code>
      </pre>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {linkifyMessageText(message, isMine)}
    </p>
  );
}

export default function Chat() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentStatus, setAttachmentStatus] = useState('');
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [sending, setSending] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'files' | 'photos'>('chat');
  const [startingCall, setStartingCall] = useState<'audio' | 'video' | null>(null);

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

  const getOtherMember = (conversation: Conversation) => conversation.members.find((member) => member.userId !== user?.id);

  const getConversationTitle = (conversation: Conversation) => {
    const otherMember = getOtherMember(conversation);
    if (conversation.type === 'Group') {
      return conversation.title || 'Group chat';
    }

    return otherMember?.userName
      || conversation.invites?.find((invite) => !invite.hasAccepted)?.email
      || 'Direct chat';
  };

  const filteredConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = getConversationTitle(conversation).toLowerCase();
      const memberMatch = conversation.members.some((member) => (
        member.userName.toLowerCase().includes(query)
        || member.userEmail.toLowerCase().includes(query)
      ));
      const inviteMatch = conversation.invites?.some((invite) => invite.email.toLowerCase().includes(query));
      return title.includes(query) || memberMatch || inviteMatch;
    });
  }, [chatSearch, conversations, user?.id]);

  const pinnedConversations = filteredConversations.slice(0, 1);
  const recentConversations = filteredConversations.slice(1);
  const pendingRequestCount = conversations.reduce((count, conversation) => (
    count + (conversation.invites || []).filter((invite) => !invite.hasAccepted).length
  ), 0);
  const selectedFiles = messages.filter((message) => message.attachmentUrl);
  const selectedPhotos = selectedFiles.filter(isImageAttachment);

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

  const getUserAvatar = (userId?: string) => {
    if (!userId) {
      return undefined;
    }

    if (user?.id === userId) {
      return user.profilePictureUrl;
    }

    return users.find((item) => item.id === userId)?.profilePictureUrl
      || accounts.find((account) => account.user.id === userId)?.user.profilePictureUrl;
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
            id: data.id || `${data.conversationId}-${data.senderId}-${data.timestamp}`,
            conversationId: data.conversationId,
            senderId: data.senderId,
            senderName: data.senderName,
            message: data.message || '',
            attachmentFileName: data.attachmentFileName,
            attachmentUrl: data.attachmentUrl,
            attachmentContentType: data.attachmentContentType,
            attachmentSizeBytes: data.attachmentSizeBytes,
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

  const handleAvatarChange = async (file: File) => {
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

  const handleSignOut = () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    logout();
    if (!hadOtherAccounts) {
      navigate('/login', { replace: true });
    }
  };

  const handleSwitchAccount = (userId: string) => {
    setLoading(true);
    setConversations([]);
    setMessages([]);
    setSelectedConversationId(null);
    setPendingFiles([]);
    setAttachmentStatus('');
    setError('');
    switchAccount(userId);
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

    setActiveTab('chat');
    joinConversation(selectedConversationId).catch(() => undefined);

    conversationAPI.getMessages(selectedConversationId)
      .then((response) => setMessages(response.data))
      .catch(() => setError('Unable to load messages'));
    setPendingFiles([]);
    setAttachmentStatus('');
    setIsDraggingAttachment(false);

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
      setNewChatOpen(false);
      setRequestStatus('Request sent. Chat is ready.');
    } catch (err: any) {
      setError(err.response?.data || 'Unable to create chat');
      setRequestStatus('');
    }
  };

  const appendSentMessage = (message: ConversationMessage) => {
    setMessages((items) => (
      items.some((item) => item.id === message.id) ? items : [...items, message]
    ));
    setConversations((items) => items.map((conversation) => (
      conversation.id === message.conversationId
        ? { ...conversation, lastMessage: message, updatedAt: message.sentAt }
        : conversation
    )));
  };

  const notifyConversationMessage = async (message: ConversationMessage) => {
    if (!user || !selectedConversation) {
      return;
    }

    await sendConversationMessage(
      selectedConversation.id,
      message.id,
      user.id,
      displayName,
      message.message,
      selectedConversation.members.filter((member) => member.userId !== user.id).map((member) => member.userId),
      message.attachmentUrl
        ? {
            attachmentFileName: message.attachmentFileName,
            attachmentUrl: message.attachmentUrl,
            attachmentContentType: message.attachmentContentType,
            attachmentSizeBytes: message.attachmentSizeBytes,
          }
        : undefined,
    );
  };

  const startInstantCall = async (mode: 'audio' | 'video') => {
    if (!user || !selectedConversation || startingCall) {
      setError('Select a chat before starting a call');
      return;
    }

    const attendeeEmails = Array.from(new Set([
      ...selectedConversation.members
        .filter((member) => member.userId !== user.id)
        .map((member) => member.userEmail)
        .filter(Boolean),
      ...(selectedConversation.invites || [])
        .filter((invite) => !invite.hasAccepted)
        .map((invite) => invite.email)
        .filter(Boolean),
    ])).filter((email) => email.toLowerCase() !== user.email.toLowerCase());

    if (attendeeEmails.length === 0) {
      setError('Add someone to this chat before starting a call');
      return;
    }

    const startedAt = new Date();
    const durationMinutes = 60;
    const callLabel = mode === 'video' ? 'video call' : 'call';
    setStartingCall(mode);
    setError('');

    try {
      const response = await meetingAPI.createMeeting({
        title: `${selectedTitle} ${mode === 'video' ? 'video call' : 'call'}`,
        description: `${displayName} started an instant ${callLabel} from chat.`,
        startTime: startedAt.toISOString(),
        endTime: new Date(startedAt.getTime() + durationMinutes * 60000).toISOString(),
        durationMinutes,
        attendeeEmails,
        location: '',
        isOnlineMeeting: true,
        lobbyEnabled: false,
        allowChat: true,
        allowReactions: true,
        allowScreenShare: true,
        allowAttendeeUnmute: true,
        allowRecording: false,
        allowTranscription: false,
        recurrenceRule: '',
        maxParticipants: Math.max(2, attendeeEmails.length + 1),
        isRecorded: false,
      });

      const meetingId = response.data.id;
      const callUrl = `${window.location.origin}/meeting/${meetingId}?call=${mode}&autojoin=1`;
      const callMessage = `${displayName} started a ${callLabel}: ${callUrl}`;
      const messageResponse = await conversationAPI.sendMessage(selectedConversation.id, {
        senderId: user.id,
        senderName: displayName,
        message: callMessage,
      });
      appendSentMessage(messageResponse.data);
      await notifyConversationMessage(messageResponse.data);
      navigate(`/meeting/${meetingId}?call=${mode}&autojoin=1`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || `Unable to start ${callLabel}`);
    } finally {
      setStartingCall(null);
    }
  };

  const addPendingFiles = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    if (incomingFiles.length === 0) {
      return;
    }

    const validFiles = incomingFiles.filter((file) => file.size <= 50 * 1024 * 1024);
    const skipped = incomingFiles.length - validFiles.length;
    setPendingFiles((items) => {
      const existing = new Set(items.map(fileKey));
      const next = [...items];
      validFiles.forEach((file) => {
        if (!existing.has(fileKey(file))) {
          next.push(file);
        }
      });
      return next;
    });
    setAttachmentStatus(skipped > 0 ? `${skipped} file${skipped === 1 ? '' : 's'} skipped. Limit is 50 MB each.` : '');
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setAttachmentStatus('');
  };

  const sendMessage = async () => {
    if (!user || !selectedConversation || sending) {
      return;
    }

    const text = messageDraft.replace(/\s+$/, '');
    const filesToSend = pendingFiles;
    if (!text.trim() && filesToSend.length === 0) {
      return;
    }

    setMessageDraft('');
    setPendingFiles([]);
    setAttachmentStatus('');
    setSending(true);

    try {
      if (filesToSend.length === 0) {
        const response = await conversationAPI.sendMessage(selectedConversation.id, {
          senderId: user.id,
          senderName: displayName,
          message: text,
        });
        appendSentMessage(response.data);
        await notifyConversationMessage(response.data);
        return;
      }

      for (const [index, file] of filesToSend.entries()) {
        const formData = new FormData();
        formData.append('senderId', user.id);
        formData.append('senderName', displayName);
        formData.append('message', index === 0 ? text : '');
        formData.append('file', file);

        const response = await conversationAPI.uploadAttachment(selectedConversation.id, formData);
        appendSentMessage(response.data);
        await notifyConversationMessage(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data || 'Unable to send message or attachment');
      setMessageDraft(text);
      setPendingFiles(filesToSend);
    } finally {
      setSending(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!selectedConversation) {
      return;
    }

    event.preventDefault();
    setIsDraggingAttachment(true);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!selectedConversation) {
      return;
    }

    event.preventDefault();
    setIsDraggingAttachment(false);
    addPendingFiles(event.dataTransfer.files);
  };

  const downloadAttachment = async (message: ConversationMessage) => {
    if (!message.attachmentUrl) {
      return;
    }

    try {
      const response = await conversationAPI.downloadAttachment(message.attachmentUrl);
      const blob = new Blob([response.data], {
        type: message.attachmentContentType || response.data.type || 'application/octet-stream',
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = message.attachmentFileName || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch {
      setAttachmentStatus('Unable to download attachment');
    }
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

  const renderConversationButton = (conversation: Conversation) => {
    const otherMember = getOtherMember(conversation);
    const title = getConversationTitle(conversation);
    const active = selectedConversationId === conversation.id;
    const preview = describeLastMessage(conversation.lastMessage, conversation.members.length);

    return (
      <button
        key={conversation.id}
        onClick={() => setSelectedConversationId(conversation.id)}
        className={`group mx-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-md px-3 py-3 text-left transition ${
          active ? 'bg-white shadow-md ring-1 ring-slate-200' : 'hover:bg-white/70'
        }`}
      >
        <UserAvatar
          displayName={title}
          email={otherMember?.userEmail}
          profilePictureUrl={conversation.type === 'Direct' ? getUserAvatar(otherMember?.userId) : undefined}
          status={conversation.type === 'Direct' ? getUserStatus(otherMember?.userId) : undefined}
          showStatus={conversation.type === 'Direct'}
          size="lg"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {formatConversationDate(conversation.lastMessage?.sentAt || conversation.updatedAt || conversation.createdAt)}
            </span>
          </span>
          <span className="mt-1 block truncate text-sm text-slate-500">
            {conversation.lastMessage?.senderId === user?.id ? 'You: ' : ''}{preview}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-200 text-slate-950">
      <div className="grid h-full grid-cols-[58px_minmax(280px,370px)_minmax(0,1fr)]">
        <nav className="flex flex-col items-center gap-2 border-r border-slate-300 bg-slate-100 py-3">
          <button className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white shadow-sm" title="Meeting Platform">
            T
          </button>
          <button className="mt-3 flex h-10 w-10 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-700" title="Chat">
            Chat
          </button>
          <button onClick={() => navigate('/dashboard')} className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold text-slate-600 hover:bg-white" title="Calendar">
            Cal
          </button>
          <button onClick={() => navigate('/create-meeting')} className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold text-slate-600 hover:bg-white" title="Meet">
            Meet
          </button>
          <button onClick={() => setNewChatOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-md text-xs font-semibold text-slate-600 hover:bg-white" title="People">
            New
          </button>
          <div className="mt-auto">
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
              onSignOut={handleSignOut}
            />
          </div>
        </nav>

        <aside className="flex min-w-0 flex-col border-r border-slate-300 bg-slate-200">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">Chat</h1>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                  onClick={() => setChatSearch('')}
                >
                  Filter
                </button>
                <button
                  type="button"
                  className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                  onClick={() => setNewChatOpen(true)}
                >
                  New
                </button>
              </div>
            </div>
            <input
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Search chats"
              className="mt-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="mt-4 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-white/70"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-700">Req</span>
              <span className="font-semibold text-slate-700">{pendingRequestCount || 0} requests</span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {loading ? (
              <p className="px-4 py-3 text-sm text-slate-500">Loading chats...</p>
            ) : filteredConversations.length === 0 ? (
              <div className="mx-3 rounded-md bg-white px-4 py-5 text-sm text-slate-500">
                No chats found.
              </div>
            ) : (
              <>
                {pinnedConversations.length > 0 && (
                  <div className="mb-3">
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pinned</p>
                    {pinnedConversations.map(renderConversationButton)}
                  </div>
                )}
                {recentConversations.length > 0 && (
                  <div>
                    <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</p>
                    {recentConversations.map(renderConversationButton)}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-300 p-3">
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Invite to Teams
            </button>
          </div>
        </aside>

        <section className="relative m-3 ml-0 flex min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <header className="flex min-h-[64px] items-center justify-between border-b border-slate-200 px-5">
            <div className="flex min-w-0 items-center gap-3">
              {selectedConversation && (
                <UserAvatar
                  displayName={selectedTitle}
                  email={getOtherMember(selectedConversation)?.userEmail}
                  profilePictureUrl={selectedConversation.type === 'Direct' ? getUserAvatar(getOtherMember(selectedConversation)?.userId) : undefined}
                  status={selectedConversation.type === 'Direct' ? getUserStatus(getOtherMember(selectedConversation)?.userId) : undefined}
                  showStatus={selectedConversation.type === 'Direct'}
                  size="md"
                />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-slate-900">{selectedTitle}</h2>
                {selectedConversation && (
                  <div className="mt-1 flex gap-4 text-sm">
                    {(['chat', 'files', 'photos'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`border-b-2 pb-2 capitalize ${
                          activeTab === tab ? 'border-indigo-600 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startInstantCall('video')}
                disabled={!selectedConversation || !!startingCall}
                className="rounded-md px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                {startingCall === 'video' ? 'Starting...' : 'Video'}
              </button>
              <button
                onClick={() => startInstantCall('audio')}
                disabled={!selectedConversation || !!startingCall}
                className="rounded-md px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                {startingCall === 'audio' ? 'Starting...' : 'Call'}
              </button>
              <button onClick={() => setNewChatOpen(true)} className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Add</button>
              <button onClick={() => setChatSearch('')} className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Search</button>
              <button className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">More</button>
            </div>
          </header>

          {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
          {isDraggingAttachment && selectedConversation && (
            <div className="pointer-events-none absolute inset-x-4 bottom-24 top-24 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-indigo-400 bg-indigo-50/90 text-sm font-semibold text-indigo-800">
              Drop files to share
            </div>
          )}

          <main
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDraggingAttachment(false)}
            onDrop={handleDrop}
            className="min-h-0 flex-1 overflow-y-auto bg-white px-8 py-6"
          >
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Choose a chat or start a new one.</div>
            ) : activeTab === 'files' ? (
              <div className="mx-auto max-w-3xl space-y-3">
                {selectedFiles.length === 0 ? (
                  <p className="text-sm text-slate-500">No files shared in this chat yet.</p>
                ) : selectedFiles.map((message) => (
                  <div key={message.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{message.attachmentFileName || 'Attachment'}</p>
                      <p className="text-xs text-slate-500">{message.senderName} - {formatFileSize(message.attachmentSizeBytes)}</p>
                    </div>
                    <button onClick={() => downloadAttachment(message)} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                      Download
                    </button>
                  </div>
                ))}
              </div>
            ) : activeTab === 'photos' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedPhotos.length === 0 ? (
                  <p className="text-sm text-slate-500">No photos shared in this chat yet.</p>
                ) : selectedPhotos.map((message) => (
                  <button key={message.id} onClick={() => downloadAttachment(message)} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left">
                    <img src={resolveApiAssetUrl(message.attachmentUrl)} alt={message.attachmentFileName || 'Shared photo'} className="h-44 w-full object-cover" />
                    <span className="block truncate px-3 py-2 text-xs text-slate-600">{message.attachmentFileName || 'Photo'}</span>
                  </button>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Start the conversation.</div>
            ) : (
              <div className="mx-auto max-w-5xl space-y-5">
                {messages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  return (
                    <div key={message.id} className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine && (
                        <UserAvatar
                          displayName={message.senderName}
                          profilePictureUrl={getUserAvatar(message.senderId)}
                          status={getUserStatus(message.senderId)}
                          showStatus
                          size="sm"
                        />
                      )}
                      {!isMine && (
                        <span className="self-start pt-1 text-xs text-slate-500">{message.senderName}</span>
                      )}
                      <div className={`max-w-[620px] rounded-md px-4 py-3 text-sm shadow-sm ${
                        isMine ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'
                      }`}>
                        <div className={`mb-1 text-xs ${isMine ? 'text-indigo-100' : 'text-slate-500'}`}>{formatMessageTime(message.sentAt)}</div>
                        {message.message && <FormattedMessage message={message.message} isMine={isMine} />}
                        {message.attachmentUrl && (
                          <div className={`mt-3 overflow-hidden rounded-md border ${isMine ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-white'}`}>
                            {isImageAttachment(message) && (
                              <img src={resolveApiAssetUrl(message.attachmentUrl)} alt={message.attachmentFileName || 'Attachment'} className="max-h-64 w-full object-cover" />
                            )}
                            <div className="px-3 py-2">
                              <p className="break-words text-sm font-semibold">{message.attachmentFileName || 'Attachment'}</p>
                              <p className={`mt-1 text-xs ${isMine ? 'text-indigo-50' : 'text-slate-500'}`}>
                                {[message.attachmentContentType, formatFileSize(message.attachmentSizeBytes)].filter(Boolean).join(' - ') || 'File'}
                              </p>
                              <button
                                onClick={() => downloadAttachment(message)}
                                className={`mt-2 rounded-md px-3 py-1.5 text-xs font-semibold ${
                                  isMine ? 'bg-white text-indigo-700 hover:bg-indigo-50' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          <footer className="border-t border-slate-200 bg-white px-8 py-4">
            {pendingFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {pendingFiles.map((file, index) => (
                  <span key={fileKey(file)} className="inline-flex max-w-full items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-indigo-100">
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
                    <button type="button" onClick={() => removePendingFile(index)} className="shrink-0 font-semibold text-slate-500 hover:text-red-600">
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachmentStatus && <p className="mb-3 text-sm font-medium text-amber-700">{attachmentStatus}</p>}
            <div className="mx-auto flex max-w-5xl items-end gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    addPendingFiles(event.target.files);
                  }
                  event.target.value = '';
                }}
              />
              <textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                    return;
                  }

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const nextDraft = `${messageDraft.slice(0, start)}  ${messageDraft.slice(end)}`;
                    setMessageDraft(nextDraft);
                    window.requestAnimationFrame(() => {
                      target.selectionStart = start + 2;
                      target.selectionEnd = start + 2;
                    });
                  }
                }}
                rows={Math.min(5, Math.max(1, messageDraft.split('\n').length))}
                disabled={!selectedConversation || sending}
                placeholder={selectedConversation ? 'Type a message' : 'Select a chat first'}
                className="max-h-36 min-w-0 flex-1 resize-none border-0 px-1 py-1 text-sm outline-none disabled:bg-white"
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!selectedConversation || sending} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                Attach
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!selectedConversation || sending} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                Image
              </button>
              <button
                onClick={sendMessage}
                disabled={!selectedConversation || sending || (!messageDraft.trim() && pendingFiles.length === 0)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </footer>
        </section>
      </div>

      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <section className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">New chat</h2>
              <button onClick={() => setNewChatOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Close
              </button>
            </div>
            <div className="mt-4 rounded-md border border-slate-300 bg-white p-1">
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
                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            )}
            <input
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              placeholder="Search people or type an email"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />

            <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto">
              {users.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">No registered users found.</p>
                  {canAddEmailInvite && (
                    <button onClick={addEmailInvite} className="w-full rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-left text-sm font-medium text-indigo-800 hover:bg-indigo-100">
                      Add email invite: {userQuery.trim()}
                    </button>
                  )}
                </div>
              ) : users.map((item) => {
                const isSelected = selectedUserIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      toggleUser(item.id);
                      setRequestStatus('');
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      isSelected ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar
                          displayName={displayUser(item)}
                          email={item.email}
                          profilePictureUrl={item.profilePictureUrl}
                          status={getUserStatus(item.id)}
                          showStatus
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{displayUser(item)}</p>
                            <UserStatusBadge status={getUserStatus(item.id)} />
                          </div>
                          <p className="truncate text-xs text-slate-500">{item.email}</p>
                        </div>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </div>
                  </button>
                );
              })}
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
                    <button onClick={() => setInviteEmails((items) => items.filter((item) => item !== email))} className="font-semibold text-amber-900 hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={createConversation}
              disabled={recipientCount === 0 || (mode === 'direct' && recipientCount !== 1)}
              className="mt-5 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {requestStatus === 'Sending request...' ? 'Sending...' : 'Send chat request'}
            </button>
            {requestStatus && requestStatus !== 'Sending request...' && (
              <p className="mt-2 text-sm font-medium text-emerald-700">{requestStatus}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
