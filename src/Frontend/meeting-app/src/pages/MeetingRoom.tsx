import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProfileStatusMenu, UserAvatar, UserStatusBadge, UserStatus, statusLabel } from '../components/UserStatus';
import { meetingAPI, userAPI } from '../services/api';
import {
  initializeSignalR,
  joinMeetingGroup,
  joinUserNotifications,
  leaveMeetingGroup,
  notifyLobbyDecision,
  notifyLobbyRequest,
  notifyParticipantJoined,
  notifyParticipantLeft,
  notifyParticipantMediaStatusChanged,
  notifyUserStatusChanged,
  onDirectChatMessage,
  onLobbyDecisionReceived,
  onLobbyRequestReceived,
  onMeetingChatMessage,
  onParticipantJoined,
  onParticipantLeft,
  onParticipantMediaStatusChanged,
  onUserStatusChanged,
  onWebRtcAnswer,
  onWebRtcIceCandidate,
  onWebRtcOffer,
  sendDirectChatMessage,
  sendMeetingChatMessage,
  sendWebRtcAnswer,
  sendWebRtcIceCandidate,
  sendWebRtcOffer,
  startSignalR,
} from '../services/signalR';
import { useAuthStore } from '../store/authStore';
import { Meeting } from '../store/meetingStore';

interface Participant {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
  isHandRaised: boolean;
  reaction?: string;
  joinedAt: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

interface UserSummary {
  id: string;
  email: string;
  profilePictureUrl?: string;
  status?: string;
}

interface ChatMessage {
  id: string;
  scope: 'group' | 'direct';
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  recipientUserId?: string;
  recipientName?: string;
}

function mapChatMessage(message: any): ChatMessage {
  return {
    id: message.id,
    scope: message.scope === 'Direct' ? 'direct' : 'group',
    senderId: message.senderId,
    senderName: message.senderName,
    recipientUserId: message.recipientUserId,
    recipientName: message.recipientName,
    message: message.message,
    timestamp: message.sentAt,
  };
}

interface LobbyRequest {
  id: string;
  userName: string;
  userEmail: string;
  status: string;
  requestedAt: string;
}

interface RemoteStream {
  userId: string;
  userName: string;
  stream: MediaStream;
}

function RemoteVideoTile({ remote }: { remote: RemoteStream }) {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remote.stream;
    }
  }, [remote.stream]);

  return (
    <div className="relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-md bg-slate-950">
      <video ref={remoteVideoRef} autoPlay playsInline className="h-full max-h-[60vh] w-full object-contain" />
      <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">{remote.userName}</div>
    </div>
  );
}

function getRtcConfiguration(): RTCConfiguration {
  const turnUrls = import.meta.env.VITE_TURN_URLS?.split(',').map((url: string) => url.trim()).filter(Boolean) || [];
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
  const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return { iceServers };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function resolveRecordingUrl(recordingUrl?: string) {
  if (!recordingUrl) {
    return '';
  }

  if (recordingUrl.startsWith('http')) {
    return recordingUrl;
  }

  return `http://localhost:5000${recordingUrl}`;
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

function linkifyChatMessageText(message: string, isMine: boolean) {
  return message.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
    if (!part.startsWith('http')) {
      return part;
    }

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className={`break-all font-semibold underline underline-offset-2 ${isMine ? 'text-white' : 'text-blue-200'}`}
      >
        {part}
      </a>
    );
  });
}

function renderChatMessageText(message: string, isMine: boolean) {
  if (looksLikeCode(message) || message.trim().startsWith('```')) {
    return (
      <pre className={`mt-1 max-h-80 overflow-auto rounded-md border px-3 py-2 text-left font-mono text-xs leading-relaxed ${isMine ? 'border-white/20 bg-blue-700 text-white' : 'border-white/10 bg-slate-950 text-slate-100'}`}>
        <code className="whitespace-pre">{stripCodeFence(message)}</code>
      </pre>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {linkifyChatMessageText(message, isMine)}
    </p>
  );
}

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(() => new URLSearchParams(window.location.search).get('call') !== 'audio');
  const [screenSharing, setScreenSharing] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatRecipient, setChatRecipient] = useState('everyone');
  const [lobbyRequests, setLobbyRequests] = useState<LobbyRequest[]>([]);
  const [waitingForLobby, setWaitingForLobby] = useState(false);
  const [lobbyAdmitted, setLobbyAdmitted] = useState(false);
  const [focusedRemoteUserId, setFocusedRemoteUserId] = useState<string | null>(null);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [inviteText, setInviteText] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState('');
  const [knownUsers, setKnownUsers] = useState<UserSummary[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<RemoteStream[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingCanvasIntervalRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingAudioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordingAudioTrackKeysRef = useRef<Set<string>>(new Set());
  const recordingVideoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const recordingStartedAtRef = useRef(0);
  const recordingStopRequestedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const currentParticipantRef = useRef<Participant | null>(null);

  const displayName = useMemo(() => {
    if (!user) {
      return 'Guest';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const getUserStatus = (userId?: string, email?: string) => {
    if (userId && statusOverrides[userId]) {
      return statusOverrides[userId];
    }

    if (userId && user?.id === userId) {
      return user.status || 'Available';
    }

    const knownUser = knownUsers.find((item) => item.id === userId || item.email.toLowerCase() === email?.toLowerCase());
    return knownUser?.status || 'Available';
  };

  const getUserAvatar = (userId?: string, email?: string) => {
    if (userId && user?.id === userId) {
      return user.profilePictureUrl;
    }

    const knownUser = knownUsers.find((item) => item.id === userId || item.email.toLowerCase() === email?.toLowerCase());
    return knownUser?.profilePictureUrl
      || accounts.find((account) => account.user.id === userId || account.user.email.toLowerCase() === email?.toLowerCase())?.user.profilePictureUrl;
  };

  const isOrganizer = meeting?.organizerId === user?.id || currentParticipant?.role === 'Organizer';

  const currentUserId = user?.id || currentParticipant?.userId || '';
  const autoJoinRequested = useMemo(() => new URLSearchParams(window.location.search).get('autojoin') === '1', []);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    currentParticipantRef.current = currentParticipant;
  }, [currentParticipant]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    connectRecordingAudioTracks('local', localStream);
    remoteStreams.forEach((remote) => connectRecordingAudioTracks(remote.userId, remote.stream));
  }, [isRecording, localStream, remoteStreams]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadMeeting = async () => {
      try {
        const [meetingResponse, participantsResponse, chatResponse, usersResponse, profileResponse] = await Promise.all([
          meetingAPI.getMeeting(id),
          meetingAPI.getParticipants(id),
          meetingAPI.getChatMessages(id).catch(() => ({ data: [] })),
          userAPI.searchUsers().catch(() => ({ data: [] })),
          userAPI.getProfile().catch(() => ({ data: user })),
        ]);
        setMeeting(meetingResponse.data);
        setMeetingNotes(meetingResponse.data.notes || '');
        setParticipants(participantsResponse.data);
        setKnownUsers(usersResponse.data);
        if (profileResponse.data) {
          setUser(profileResponse.data);
        }
        setChatMessages(chatResponse.data.map(mapChatMessage));
      } catch (err: any) {
        setError(err.response?.data || 'Unable to load meeting');
      } finally {
        setLoading(false);
      }
    };

    loadMeeting();
  }, [id, user?.id, setUser]);

  const getParticipantName = (userId: string) => {
    return participantsRef.current.find((participant) => participant.userId === userId)?.userName || 'Participant';
  };

  const removeRemotePeer = (userId: string) => {
    peerConnectionsRef.current[userId]?.close();
    delete peerConnectionsRef.current[userId];
    delete pendingIceCandidatesRef.current[userId];
    setRemoteStreams((streams) => streams.filter((remote) => remote.userId !== userId));
  };

  const replaceOutgoingVideoTrack = async (track: MediaStreamTrack | null) => {
    await Promise.all(
      Object.entries(peerConnectionsRef.current).map(async ([remoteUserId, connection]) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === 'video');

        if (sender) {
          await sender.replaceTrack(track);
          return;
        }

        if (!track || !id || !currentUserId || connection.signalingState !== 'stable') {
          return;
        }

        connection.addTrack(track, localStreamRef.current || new MediaStream([track]));
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendWebRtcOffer(id, currentUserId, remoteUserId, JSON.stringify(offer));
      }),
    );
  };

  const getLiveVideoTrack = () => {
    return localStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live') || null;
  };

  const attachLocalVideoTrack = async (track: MediaStreamTrack) => {
    const existingStream = localStreamRef.current;
    existingStream?.getVideoTracks().forEach((existingTrack) => {
      if (existingTrack.id !== track.id) {
        existingTrack.stop();
      }
    });

    const nextStream = new MediaStream([
      ...(existingStream?.getAudioTracks() || []),
      track,
    ]);

    localStreamRef.current = nextStream;
    setLocalStream(nextStream);
    await replaceOutgoingVideoTrack(screenStreamRef.current?.getVideoTracks()[0] || track);
  };

  const ensureLocalVideoTrack = async () => {
    const existingTrack = getLiveVideoTrack();
    if (existingTrack) {
      existingTrack.enabled = true;
      await replaceOutgoingVideoTrack(screenStreamRef.current?.getVideoTracks()[0] || existingTrack);
      return existingTrack;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not available in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const [track] = stream.getVideoTracks();
    if (!track) {
      throw new Error('No camera track was returned');
    }

    track.enabled = true;
    track.addEventListener('ended', () => {
      setVideoEnabled(false);
      setLocalStream((currentStream) => {
        if (!currentStream) {
          localStreamRef.current = null;
          return null;
        }

        const nextStream = new MediaStream(currentStream.getAudioTracks());
        localStreamRef.current = nextStream;
        return nextStream;
      });
      replaceOutgoingVideoTrack(null).catch(() => undefined);
    });

    await attachLocalVideoTrack(track);
    return track;
  };

  const getRecordingVideoElement = (key: string, stream: MediaStream | null) => {
    let video = recordingVideoElementsRef.current[key];
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      recordingVideoElementsRef.current[key] = video;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }

    return video;
  };

  const drawRecordingTile = (
    context: CanvasRenderingContext2D,
    source: { key: string; label: string; stream: MediaStream | null; initials: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    context.fillStyle = '#020617';
    context.fillRect(x, y, width, height);

    const hasLiveVideo = source.stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
    const video = getRecordingVideoElement(source.key, source.stream);

    if (hasLiveVideo && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    } else {
      context.fillStyle = '#1e3a8a';
      context.beginPath();
      context.arc(x + width / 2, y + height / 2, Math.min(width, height) * 0.16, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = `${Math.max(26, Math.floor(Math.min(width, height) * 0.16))}px Segoe UI, Arial`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(source.initials.slice(0, 2).toUpperCase(), x + width / 2, y + height / 2);
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(x + 10, y + height - 38, Math.min(width - 20, 260), 28);
    context.fillStyle = '#ffffff';
    context.font = '16px Segoe UI, Arial';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(source.label, x + 20, y + height - 24, width - 40);
  };

  const drawRecordingFrame = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, width, height);

    const localSource = {
      key: 'local',
      label: `${displayName} (You)`,
      stream: localStreamRef.current,
      initials: displayName.charAt(0) || 'Y',
    };
    const remoteSources = remoteStreamsRef.current.map((remote) => ({
      key: remote.userId,
      label: remote.userName,
      stream: remote.stream,
      initials: remote.userName.charAt(0) || 'P',
    }));
    const screenTrack = screenStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');

    if (screenTrack && screenStreamRef.current) {
      drawRecordingTile(context, {
        key: 'screen',
        label: 'Screen share',
        stream: screenStreamRef.current,
        initials: 'S',
      }, 0, 0, width, height);

      const thumbnails = [localSource, ...remoteSources].slice(0, 5);
      thumbnails.forEach((source, index) => {
        const tileWidth = 210;
        const tileHeight = 118;
        const x = 18 + index * (tileWidth + 12);
        const y = height - tileHeight - 18;
        drawRecordingTile(context, source, x, y, tileWidth, tileHeight);
      });
      return;
    }

    const sources = [localSource, ...remoteSources];
    const count = Math.max(1, sources.length);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const gap = 18;
    const tileWidth = (width - gap * (columns + 1)) / columns;
    const tileHeight = (height - gap * (rows + 1)) / rows;

    sources.forEach((source, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (tileWidth + gap);
      const y = gap + row * (tileHeight + gap);
      drawRecordingTile(context, source, x, y, tileWidth, tileHeight);
    });
  };

  const cleanupRecordingResources = () => {
    if (recordingCanvasIntervalRef.current) {
      window.clearInterval(recordingCanvasIntervalRef.current);
      recordingCanvasIntervalRef.current = null;
    }

    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recordingStartedAtRef.current = 0;
    recordingStopRequestedRef.current = false;
    recordingAudioDestinationRef.current = null;
    recordingAudioSourcesRef.current = [];
    recordingAudioTrackKeysRef.current.clear();
    recordingAudioContextRef.current?.close().catch(() => undefined);
    recordingAudioContextRef.current = null;
    Object.values(recordingVideoElementsRef.current).forEach((video) => {
      video.pause();
      video.srcObject = null;
    });
    recordingVideoElementsRef.current = {};
  };

  const connectRecordingAudioTracks = (sourceKey: string, stream: MediaStream | null) => {
    const audioContext = recordingAudioContextRef.current;
    const destination = recordingAudioDestinationRef.current;
    if (!audioContext || !destination) {
      return;
    }

    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === 'live') || [];
    tracks.forEach((track) => {
      const trackKey = `${sourceKey}:${track.id}`;
      if (recordingAudioTrackKeysRef.current.has(trackKey)) {
        return;
      }

      const audioSource = audioContext.createMediaStreamSource(new MediaStream([track]));
      audioSource.connect(destination);
      recordingAudioSourcesRef.current.push(audioSource);
      recordingAudioTrackKeysRef.current.add(trackKey);
    });
  };

  const createRecordingStream = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    drawRecordingFrame(canvas);
    recordingCanvasIntervalRef.current = window.setInterval(() => drawRecordingFrame(canvas), 1000 / 15);

    const canvasStream = canvas.captureStream(15);
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    const destination = audioContext.createMediaStreamDestination();
    recordingAudioContextRef.current = audioContext;
    recordingAudioDestinationRef.current = destination;
    recordingAudioSourcesRef.current = [];
    recordingAudioTrackKeysRef.current.clear();

    connectRecordingAudioTracks('local', localStreamRef.current);
    remoteStreamsRef.current.forEach((remote) => connectRecordingAudioTracks(remote.userId, remote.stream));

    return new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
  };

  const uploadRecordingBlob = async (blob: Blob) => {
    if (!id || !meeting) {
      throw new Error('Meeting is not loaded');
    }

    const formData = new FormData();
    const safeTitle = meeting.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'meeting';
    formData.append('recording', blob, `${safeTitle}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`);
    const response = await meetingAPI.uploadRecording(id, formData);
    setMeeting(response.data);
    return response.data as Meeting;
  };

  const shareRecordingInChat = async (updatedMeeting: Meeting) => {
    if (!id || !currentParticipant || !updatedMeeting.recordingUrl) {
      return;
    }

    const senderId = user?.id || currentParticipant.userId;
    const recordingUrl = resolveRecordingUrl(updatedMeeting.recordingUrl);
    const message = `Recording is ready: ${recordingUrl}`;
    const saved = await meetingAPI.sendChatMessage(id, {
      senderId,
      senderName: displayName,
      message,
    });
    setChatMessages((messages) => [...messages, mapChatMessage(saved.data)]);
    await sendMeetingChatMessage(id, senderId, displayName, message).catch(() => undefined);
  };

  const getMediaRecorderOptions = () => {
    const supportedType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));

    return supportedType ? { mimeType: supportedType } : undefined;
  };

  const startRecording = async () => {
    if (!meeting?.allowRecording || !currentParticipant || !isOrganizer) {
      setRecordingStatus('Recording is not available for this meeting');
      return;
    }

    if (!window.MediaRecorder) {
      setRecordingStatus('Recording is not supported in this browser');
      return;
    }

    try {
      setRecordingStatus('Preparing recording...');
      recordingChunksRef.current = [];
      recordingStopRequestedRef.current = false;
      const recordingStream = await createRecordingStream();
      recordingStreamRef.current = recordingStream;
      const recorder = new MediaRecorder(recordingStream, getMediaRecorderOptions());
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        cleanupRecordingResources();

        if (blob.size === 0) {
          setRecordingStatus('Recording was empty. Please record for at least a few seconds.');
          return;
        }

        try {
          setRecordingStatus('Saving recording...');
          const updatedMeeting = await uploadRecordingBlob(blob);
          try {
            await shareRecordingInChat(updatedMeeting);
            setRecordingStatus('Recording saved and shared in chat');
            setActivity((items) => ['Recording saved and shared in chat', ...items].slice(0, 5));
          } catch {
            setRecordingStatus('Recording saved, but chat link could not be shared');
            setActivity((items) => ['Recording saved', ...items].slice(0, 5));
          }
        } catch {
          setRecordingStatus('Recording could not be uploaded');
        }
      };

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      setRecordingStatus('Recording in progress');
    } catch {
      cleanupRecordingResources();
      setIsRecording(false);
      setRecordingStatus('Recording could not be started');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording' && !recordingStopRequestedRef.current) {
      recordingStopRequestedRef.current = true;
      setRecordingStatus('Stopping recording...');
      const elapsedMilliseconds = Date.now() - recordingStartedAtRef.current;
      const stopDelayMilliseconds = Math.max(0, 1500 - elapsedMilliseconds);
      window.setTimeout(() => {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // Some browsers throw if the recorder has already queued its final chunk.
          }
          recorder.stop();
        }
      }, stopDelayMilliseconds);
    }
  };

  const enableRecording = async () => {
    if (!id || !meeting || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.updateMeeting(id, {
      title: meeting.title,
      description: meeting.description,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      durationMinutes: meeting.durationMinutes,
      attendeeEmails: meeting.attendeeEmails || [],
      location: meeting.location,
      isOnlineMeeting: meeting.isOnlineMeeting,
      lobbyEnabled: meeting.lobbyEnabled,
      allowChat: meeting.allowChat,
      allowReactions: meeting.allowReactions,
      allowScreenShare: meeting.allowScreenShare,
      allowAttendeeUnmute: meeting.allowAttendeeUnmute,
      allowRecording: true,
      allowTranscription: meeting.allowTranscription,
      recurrenceRule: meeting.recurrenceRule,
      maxParticipants: meeting.maxParticipants,
    });
    setMeeting(response.data);
    setRecordingStatus('Recording enabled');
  };

  const flushPendingIceCandidates = async (remoteUserId: string, connection: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current[remoteUserId] || [];
    delete pendingIceCandidatesRef.current[remoteUserId];

    for (const candidate of candidates) {
      await connection.addIceCandidate(candidate);
    }
  };

  const createPeerConnection = (remoteUserId: string) => {
    if (!id) {
      return null;
    }

    const existing = peerConnectionsRef.current[remoteUserId];
    if (existing) {
      return existing;
    }

    const connection = new RTCPeerConnection(getRtcConfiguration());
    peerConnectionsRef.current[remoteUserId] = connection;

    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current as MediaStream);
    });

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      setRemoteStreams((streams) => {
        const userName = getParticipantName(remoteUserId);
        const existingStream = streams.find((remote) => remote.userId === remoteUserId);
        if (existingStream) {
          return streams.map((remote) => (remote.userId === remoteUserId ? { userId: remoteUserId, userName, stream } : remote));
        }

        return [...streams, { userId: remoteUserId, userName, stream }];
      });
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate || !currentUserId) {
        return;
      }

      sendWebRtcIceCandidate(id, currentUserId, remoteUserId, JSON.stringify(event.candidate)).catch((err) => {
        console.warn('Unable to send ICE candidate', err);
      });
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
        removeRemotePeer(remoteUserId);
      }
    };

    return connection;
  };

  const startCallWithParticipant = async (remoteUserId: string) => {
    if (!id || !currentUserId || !localStreamRef.current || remoteUserId === currentUserId) {
      return;
    }

    if (peerConnectionsRef.current[remoteUserId]) {
      return;
    }

    const connection = createPeerConnection(remoteUserId);
    if (!connection || connection.signalingState !== 'stable') {
      return;
    }

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await sendWebRtcOffer(id, currentUserId, remoteUserId, JSON.stringify(offer));
  };

  useEffect(() => {
    if (!id || !token) {
      return;
    }

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        await joinMeetingGroup(id);
        if (user?.id) {
          await joinUserNotifications(user.id);
        }
        onUserStatusChanged((data) => {
          setStatusOverrides((items) => ({ ...items, [data.userId]: data.status }));
          setKnownUsers((items) => items.map((item) => (
            item.id === data.userId ? { ...item, status: data.status } : item
          )));

          if (data.userId === user?.id && user) {
            setUser({ ...user, status: data.status });
          }
        });
        onParticipantJoined((data) => {
          setActivity((items) => [`${data.participantName} joined`, ...items].slice(0, 5));
          refreshParticipants().catch(() => undefined);
        });
        onParticipantLeft((data) => {
          setActivity((items) => [`${data.participantName} left`, ...items].slice(0, 5));
          refreshParticipants().catch(() => undefined);
        });
        onMeetingChatMessage((data) => {
          if (data.senderId === user?.id) {
            return;
          }
          setChatMessages((messages) => [
            ...messages,
            {
              id: `${data.timestamp}-${data.senderId}-${messages.length}`,
              scope: 'group',
              senderId: data.senderId,
              senderName: data.senderName,
              message: data.message,
              timestamp: data.timestamp,
            },
          ]);
        });
        onDirectChatMessage((data) => {
          if (data.senderId === user?.id) {
            return;
          }
          setChatMessages((messages) => [
            ...messages,
            {
              id: `${data.timestamp}-${data.senderId}-${messages.length}`,
              scope: 'direct',
              senderId: data.senderId,
              senderName: data.senderName,
              recipientUserId: data.recipientUserId,
              recipientName: data.recipientName,
              message: data.message,
              timestamp: data.timestamp,
            },
          ]);
        });
        onParticipantMediaStatusChanged((data) => {
          setParticipants((items) => items.map((participant) => (
            participant.userId === data.userId
              ? {
                  ...participant,
                  isAudioEnabled: data.audioEnabled,
                  isVideoEnabled: data.videoEnabled,
                  isScreenSharing: data.screenSharing,
                }
              : participant
          )));
          setActivity((items) => [
            `${data.participantName} ${data.screenSharing ? 'started presenting' : data.audioEnabled ? 'updated media' : 'muted'}`,
            ...items,
          ].slice(0, 5));
        });
        onLobbyRequestReceived((data) => {
          if (!isOrganizer) {
            return;
          }

          setLobbyRequests((requests) => {
            if (requests.some((request) => request.id === data.requestId)) {
              return requests;
            }

            return [
              {
                id: data.requestId,
                userName: data.userName,
                userEmail: data.userEmail,
                status: 'Waiting',
                requestedAt: data.timestamp,
              },
              ...requests,
            ];
          });
          setActivity((items) => [`${data.userName} is waiting in the lobby`, ...items].slice(0, 5));
        });
        onLobbyDecisionReceived((data) => {
          if (data.userId === user?.id) {
            setWaitingForLobby(false);
            setLobbyAdmitted(data.admitted);
            setActivity((items) => [
              data.admitted ? 'You were admitted from the lobby' : 'Your lobby request was denied',
              ...items,
            ].slice(0, 5));
          }

          if (isOrganizer) {
            setLobbyRequests((requests) => requests.map((request) => (
              request.userName === data.userName
                ? { ...request, status: data.admitted ? 'Admitted' : 'Denied' }
                : request
            )));
          }
        });
        onWebRtcOffer(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = createPeerConnection(data.senderUserId);
            if (!connection) {
              return;
            }

            await connection.setRemoteDescription(JSON.parse(data.sdp));
            await flushPendingIceCandidates(data.senderUserId, connection);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendWebRtcAnswer(id, localUserId, data.senderUserId, JSON.stringify(answer));
          } catch (err) {
            console.warn('Unable to answer WebRTC offer', err);
          }
        });
        onWebRtcAnswer(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = peerConnectionsRef.current[data.senderUserId];
            if (!connection) {
              return;
            }

            await connection.setRemoteDescription(JSON.parse(data.sdp));
            await flushPendingIceCandidates(data.senderUserId, connection);
          } catch (err) {
            console.warn('Unable to accept WebRTC answer', err);
          }
        });
        onWebRtcIceCandidate(async (data) => {
          const localUserId = user?.id || currentParticipantRef.current?.userId;
          if (!localUserId || data.targetUserId !== localUserId || data.senderUserId === localUserId) {
            return;
          }

          try {
            const connection = createPeerConnection(data.senderUserId);
            if (!connection) {
              return;
            }

            const candidate = JSON.parse(data.candidate);
            if (!connection.remoteDescription) {
              pendingIceCandidatesRef.current[data.senderUserId] = [
                ...(pendingIceCandidatesRef.current[data.senderUserId] || []),
                candidate,
              ];
              return;
            }

            await connection.addIceCandidate(candidate);
          } catch (err) {
            console.warn('Unable to add WebRTC ICE candidate', err);
          }
        });
      })
      .catch((signalRError) => {
        console.warn('SignalR connection failed', signalRError);
      });

    return () => {
      leaveMeetingGroup(id).catch(() => undefined);
    };
  }, [id, isOrganizer, setUser, token, user?.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream, screenStream]);

  useEffect(() => {
    if (!currentParticipant || !localStream || !currentUserId) {
      return;
    }

    participants
      .filter((participant) => participant.userId && participant.userId !== currentUserId)
      .forEach((participant) => {
        if (currentUserId.localeCompare(participant.userId) < 0) {
          startCallWithParticipant(participant.userId).catch((err) => {
            console.warn('Unable to start WebRTC call', err);
          });
        }
      });
  }, [currentParticipant, currentUserId, localStream, participants]);

  useEffect(() => {
    return () => {
      Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
      peerConnectionsRef.current = {};
      pendingIceCandidatesRef.current = {};
      cleanupRecordingResources();
      setRemoteStreams([]);
    };
  }, []);

  const refreshParticipants = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.getParticipants(id);
    setParticipants(response.data);
  };

  const refreshLobby = async () => {
    if (!id) {
      return;
    }

    const response = await meetingAPI.getLobbyRequests(id);
    setLobbyRequests(response.data);
  };

  const handleJoin = async () => {
    if (!id || !meeting) {
      return;
    }

    setJoining(true);
    setError('');

    try {
      if (meeting.lobbyEnabled && meeting.organizerId !== user?.id && !lobbyAdmitted) {
        const response = await meetingAPI.requestLobbyAccess(id, {
          userEmail: user?.email || 'guest@example.com',
          userName: displayName,
        });
        setWaitingForLobby(true);
        await notifyLobbyRequest(
          id,
          response.data.id,
          response.data.userId || user?.id || '',
          response.data.userName || displayName,
          response.data.userEmail || user?.email || 'guest@example.com',
        );
        setActivity((items) => ['Request sent to the organizer', ...items].slice(0, 5));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoEnabled });
        setLocalStream(stream);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = audioEnabled;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = videoEnabled;
        });
      } catch {
        if (videoEnabled) {
          try {
            const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(audioOnlyStream);
            audioOnlyStream.getAudioTracks().forEach((track) => {
              track.enabled = audioEnabled;
            });
            setVideoEnabled(false);
            setActivity((items) => ['Camera could not be started. Joined with audio only.', ...items].slice(0, 5));
          } catch {
            setActivity((items) => ['Camera or microphone permission was not granted', ...items].slice(0, 5));
          }
        } else {
          setActivity((items) => ['Microphone permission was not granted', ...items].slice(0, 5));
        }
      }

      const response = await meetingAPI.joinMeeting(id, {
        userEmail: user?.email || 'guest@example.com',
        userName: displayName,
      });
      setCurrentParticipant(response.data);
      await refreshParticipants();
      if (response.data.role === 'Organizer') {
        await refreshLobby();
      }
      await notifyParticipantJoined(id, displayName);
    } catch (err: any) {
      setError(err.response?.data || 'Unable to join meeting');
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!autoJoinRequested || autoJoinAttemptedRef.current || !meeting || currentParticipant || joining || waitingForLobby) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    handleJoin().catch(() => undefined);
  }, [autoJoinRequested, meeting, currentParticipant, joining, waitingForLobby]);

  const handleLeave = async () => {
    if (!id || !currentParticipant) {
      navigate('/dashboard', { replace: true });
      return;
    }

    try {
      localStream?.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
      Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
      peerConnectionsRef.current = {};
      pendingIceCandidatesRef.current = {};
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      } else {
        cleanupRecordingResources();
      }
      setRemoteStreams([]);
      await meetingAPI.leaveMeeting(id, currentParticipant.id);
      await notifyParticipantLeft(id, displayName);
    } finally {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleSignOut = async () => {
    const hadOtherAccounts = accounts.some((account) => account.user.id !== user?.id);
    try {
      if (id && currentParticipant) {
        localStream?.getTracks().forEach((track) => track.stop());
        screenStream?.getTracks().forEach((track) => track.stop());
        Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
        peerConnectionsRef.current = {};
        pendingIceCandidatesRef.current = {};
        cleanupRecordingResources();
        setRemoteStreams([]);
        await meetingAPI.leaveMeeting(id, currentParticipant.id);
        await notifyParticipantLeft(id, displayName);
      }
    } finally {
      logout();
      navigate(hadOtherAccounts ? '/dashboard' : '/login', { replace: true });
    }
  };

  const handleSwitchAccount = async (userId: string) => {
    try {
      if (id && currentParticipant) {
        localStream?.getTracks().forEach((track) => track.stop());
        screenStream?.getTracks().forEach((track) => track.stop());
        Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
        peerConnectionsRef.current = {};
        pendingIceCandidatesRef.current = {};
        cleanupRecordingResources();
        setRemoteStreams([]);
        await meetingAPI.leaveMeeting(id, currentParticipant.id);
        await notifyParticipantLeft(id, displayName);
      }
    } finally {
      switchAccount(userId);
      navigate('/dashboard', { replace: true });
    }
  };

  const updatePresenceStatus = async (status: UserStatus) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    setUser({ ...user, status });
    setStatusOverrides((items) => ({ ...items, [user.id]: status }));

    try {
      const response = await userAPI.updateStatus(status);
      setUser(response.data);
      setStatusOverrides((items) => ({ ...items, [user.id]: response.data.status }));
      await notifyUserStatusChanged(user.id, displayName, response.data.status).catch(() => undefined);
    } catch {
      setUser(previousUser);
      setStatusOverrides((items) => ({ ...items, [user.id]: previousUser.status || 'Available' }));
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

  const updateStatus = async (updates: Partial<{ audio: boolean; video: boolean; sharing: boolean }>) => {
    if (!id || !currentParticipant) {
      return;
    }

    const nextAudio = updates.audio ?? audioEnabled;
    const nextVideo = updates.video ?? videoEnabled;
    const nextSharing = updates.sharing ?? screenSharing;

    setAudioEnabled(nextAudio);
    setVideoEnabled(nextVideo);
    setScreenSharing(nextSharing);

    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = nextAudio;
    });

    if (updates.video !== undefined) {
      if (nextVideo) {
        try {
          await ensureLocalVideoTrack();
        } catch {
          setVideoEnabled(false);
          setActivity((items) => ['Camera could not be started. Check browser permission and camera availability.', ...items].slice(0, 5));
          return;
        }
      } else {
        localStreamRef.current?.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });

        if (!nextSharing) {
          await replaceOutgoingVideoTrack(null);
        }
      }
    } else {
      localStream?.getVideoTracks().forEach((track) => {
        track.enabled = nextVideo;
      });
    }

    if (updates.sharing !== undefined) {
      if (nextSharing) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          stream.getVideoTracks()[0]?.addEventListener('ended', () => {
            setScreenStream(null);
            setScreenSharing(false);
            replaceOutgoingVideoTrack(videoEnabled ? getLiveVideoTrack() : null).catch(() => undefined);
          });
          setScreenStream(stream);
          await replaceOutgoingVideoTrack(stream.getVideoTracks()[0] || null);
        } catch {
          setScreenSharing(false);
          return;
        }
      } else {
        screenStream?.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
        await replaceOutgoingVideoTrack(nextVideo ? getLiveVideoTrack() : null);
      }
    }

    await meetingAPI.updateParticipantStatus(id, currentParticipant.id, {
      audioEnabled: nextAudio,
      videoEnabled: nextVideo,
      screenSharing: nextSharing,
    });
    await notifyParticipantMediaStatusChanged(
      id,
      currentParticipant.userId,
      displayName,
      nextAudio,
      nextVideo,
      nextSharing,
    );
    await refreshParticipants();
  };

  const handleSendChat = async () => {
    const message = chatDraft.replace(/\s+$/, '');
    if (!id || !currentParticipant || !message.trim()) {
      return;
    }

    setChatDraft('');
    const senderId = user?.id || currentParticipant.userId;

    if (chatRecipient === 'everyone') {
      const saved = await meetingAPI.sendChatMessage(id, {
        senderId,
        senderName: displayName,
        message,
      });
      setChatMessages((messages) => [
        ...messages,
        {
          id: saved.data.id,
          scope: 'group',
          senderId: saved.data.senderId,
          senderName: saved.data.senderName,
          message: saved.data.message,
          timestamp: saved.data.sentAt,
        },
      ]);
      await sendMeetingChatMessage(id, senderId, displayName, message);
      return;
    }

    const recipient = participants.find((participant) => participant.userId === chatRecipient);
    if (!recipient) {
      return;
    }

    const saved = await meetingAPI.sendChatMessage(id, {
      senderId,
      senderName: displayName,
      recipientUserId: recipient.userId,
      recipientName: recipient.userName,
      message,
    });
    setChatMessages((messages) => [
      ...messages,
      {
        id: saved.data.id,
        scope: 'direct',
        senderId: saved.data.senderId,
        senderName: saved.data.senderName,
        recipientUserId: saved.data.recipientUserId,
        recipientName: saved.data.recipientName,
        message: saved.data.message,
        timestamp: saved.data.sentAt,
      },
    ]);

    await sendDirectChatMessage(
      id,
      recipient.userId,
      senderId,
      displayName,
      recipient.userName,
      message,
    );
  };

  const saveNotes = async () => {
    if (!id || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.updateNotes(id, { notes: meetingNotes });
    setMeeting(response.data);
  };

  const sendEmailInvites = async () => {
    if (!id || !inviteText.trim()) {
      return;
    }

    const emails = inviteText
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return;
    }

    setInviteStatus('Sending invites...');
    try {
      await meetingAPI.sendInvites(id, { emails });
      setInviteText('');
      setInviteStatus(`Invite${emails.length === 1 ? '' : 's'} sent`);
    } catch (err: any) {
      setInviteStatus(err.response?.data || 'Unable to send invites');
    }
  };

  const copyJoinLink = async () => {
    const link = meeting?.meetingLink || window.location.href;

    try {
      await navigator.clipboard.writeText(link);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Unable to copy');
    }

    window.setTimeout(() => setCopyStatus(''), 2500);
  };

  const updateRole = async (participantId: string, role: string) => {
    if (!id || !isOrganizer) {
      return;
    }

    await meetingAPI.updateParticipantRole(id, participantId, { role });
    await refreshParticipants();
  };

  const decideLobby = async (requestId: string, admit: boolean) => {
    if (!id || !isOrganizer) {
      return;
    }

    const response = await meetingAPI.decideLobbyRequest(id, requestId, { admit });
    await notifyLobbyDecision(
      id,
      response.data.userId,
      response.data.userName,
      admit,
    );
    await refreshLobby();
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading meeting...</div>;
  }

  if (error || !meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Meeting unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'This meeting could not be found.'}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Back to calendar
          </button>
        </div>
      </div>
    );
  }

  const hasJoined = !!currentParticipant;
  const focusedRemoteStream = remoteStreams.find((remote) => remote.userId === focusedRemoteUserId) || null;
  const visibleRemoteStreams = focusedRemoteStream
    ? remoteStreams.filter((remote) => remote.userId !== focusedRemoteStream.userId)
    : remoteStreams;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">{meeting.title}</h1>
            <p className="text-sm text-slate-300">{formatDateTime(meeting.startTime)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ProfileStatusMenu
              displayName={displayName}
              currentUserId={user?.id}
              email={user?.email}
              profilePictureUrl={user?.profilePictureUrl}
              status={user?.status}
              accounts={accounts.map((account) => account.user)}
              avatarUploading={avatarUploading}
              onChange={updatePresenceStatus}
              onSwitchAccount={handleSwitchAccount}
              onAddAccount={() => navigate('/login?addAccount=1')}
              onAvatarChange={handleAvatarChange}
              onAvatarRemove={handleAvatarRemove}
              onSignOut={handleSignOut}
              dark
            />
            <button
              onClick={handleLeave}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {hasJoined ? 'Leave' : 'Close'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-md border border-white/10 bg-slate-900 p-4">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-800 p-3">
            {hasJoined ? (
              <div className="relative flex h-full w-full flex-col gap-3">
                {focusedRemoteStream && (
                  <button
                    onClick={() => setFocusedRemoteUserId(null)}
                    className="absolute right-3 top-3 z-10 rounded bg-black/60 px-3 py-2 text-xs font-semibold text-white hover:bg-black/80"
                  >
                    Unpin
                  </button>
                )}
                {focusedRemoteStream ? (
                  <RemoteVideoTile remote={focusedRemoteStream} />
                ) : (
                  <div className="relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-md bg-slate-950">
                    {screenStream ? (
                      <video ref={screenVideoRef} autoPlay playsInline muted className="h-full max-h-[60vh] w-full object-contain" />
                    ) : localStream && videoEnabled ? (
                      <video ref={videoRef} autoPlay playsInline muted className="h-full max-h-[60vh] w-full object-contain" />
                    ) : (
                      <UserAvatar
                        displayName={displayName}
                        email={user?.email}
                        profilePictureUrl={user?.profilePictureUrl}
                        size="xl"
                        dark
                      />
                    )}
                    <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
                      You {audioEnabled ? '' : '(muted)'} {screenSharing ? '- presenting' : ''}
                    </div>
                  </div>
                )}
                {visibleRemoteStreams.length > 0 && (
                  <div className="grid max-h-56 gap-3 overflow-y-auto md:grid-cols-2">
                    {visibleRemoteStreams.map((remote) => (
                      <button
                        key={remote.userId}
                        onClick={() => setFocusedRemoteUserId(remote.userId)}
                        className="block text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <RemoteVideoTile remote={remote} />
                      </button>
                    ))}
                  </div>
                )}
                {remoteStreams.length === 0 && (
                  <div className="absolute right-8 top-8 rounded-md bg-black/40 px-3 py-2 text-sm text-slate-200">
                    Waiting for others to join
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md text-center">
                <h2 className="text-2xl font-semibold">Ready to join?</h2>
                <p className="mt-2 text-slate-300">{meeting.description || 'Join when you are ready.'}</p>
                <button
                  onClick={handleJoin}
                  disabled={joining || waitingForLobby}
                  className="mt-6 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {joining ? 'Joining...' : waitingForLobby ? 'Waiting for organizer' : lobbyAdmitted ? 'Join admitted meeting' : 'Join now'}
                </button>
                {waitingForLobby && (
                  <p className="mt-3 text-sm text-amber-200">The organizer has your lobby request.</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              disabled={!hasJoined}
              onClick={() => updateStatus({ audio: !audioEnabled })}
              className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
                audioEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {audioEnabled ? 'Mute' : 'Unmute'}
            </button>
            <button
              disabled={!hasJoined}
              onClick={() => updateStatus({ video: !videoEnabled })}
              className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
                videoEnabled ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {videoEnabled ? 'Stop video' : 'Start video'}
            </button>
            <button
              disabled={!hasJoined}
              onClick={() => updateStatus({ sharing: !screenSharing })}
              className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
                screenSharing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {screenSharing ? 'Stop sharing' : 'Share screen'}
            </button>
            {isOrganizer && (
              meeting.allowRecording ? (
                <button
                  disabled={!hasJoined || recordingStatus === 'Saving recording...' || recordingStatus === 'Preparing recording...' || recordingStatus === 'Stopping recording...'}
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
                    isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isRecording ? `Stop recording ${formatDuration(recordingSeconds)}` : 'Start recording'}
                </button>
              ) : (
                <button
                  disabled={!hasJoined}
                  onClick={enableRecording}
                  className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-40"
                >
                  Enable recording
                </button>
              )
            )}
          </div>
          {recordingStatus && (
            <p className={`mt-3 text-center text-sm ${isRecording ? 'text-red-200' : 'text-slate-300'}`}>
              {recordingStatus}
            </p>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-white/10 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Meeting details</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>{meeting.isOnlineMeeting ? 'Online meeting' : 'In-person meeting'}</p>
              {meeting.location && <p>{meeting.location}</p>}
              <p>{meeting.durationMinutes || 60} minutes</p>
              <p>Lobby {meeting.lobbyEnabled ? 'enabled' : 'disabled'}</p>
              <p>{meeting.allowRecording ? 'Recording allowed' : 'Recording unavailable'} - {meeting.allowTranscription ? 'Transcription allowed' : 'Transcription unavailable'}</p>
              {meeting.recordingUrl && (
                <a
                  href={resolveRecordingUrl(meeting.recordingUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  Open recording
                </a>
              )}
              {meeting.meetingLink && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyJoinLink}
                    className="rounded-md border border-white/10 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
                  >
                    Copy join link
                  </button>
                  {copyStatus && (
                    <span
                      aria-live="polite"
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        copyStatus === 'Copied' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'
                      }`}
                    >
                      {copyStatus}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          {isOrganizer && (
            <section className="rounded-md border border-white/10 bg-slate-900 p-4">
              <h2 className="text-base font-semibold">Invite by email</h2>
              <textarea
                value={inviteText}
                onChange={(event) => setInviteText(event.target.value)}
                rows={3}
                placeholder="name@example.com, teammate@example.com"
                className="mt-3 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button
                onClick={sendEmailInvites}
                disabled={!inviteText.trim()}
                className="mt-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send invite
              </button>
              {inviteStatus && <p className="mt-2 text-xs text-slate-300">{inviteStatus}</p>}
            </section>
          )}

          <section className="rounded-md border border-white/10 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Participants ({participants.length})</h2>
            <div className="mt-3 space-y-2">
              {participants.length === 0 ? (
                <p className="text-sm text-slate-400">No one has joined yet.</p>
              ) : (
                participants.map((participant) => (
                  <div key={participant.id} className="rounded-md bg-slate-800 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar
                          displayName={participant.userName}
                          email={participant.userEmail}
                          profilePictureUrl={getUserAvatar(participant.userId, participant.userEmail)}
                          status={getUserStatus(participant.userId, participant.userEmail)}
                          showStatus
                          size="sm"
                          dark
                        />
                        <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{participant.userName}</p>
                          <UserStatusBadge status={getUserStatus(participant.userId, participant.userEmail)} compact />
                        </div>
                        <p className="text-xs text-slate-400">{statusLabel(getUserStatus(participant.userId, participant.userEmail))}</p>
                        </div>
                      </div>
                      {isOrganizer && participant.userId !== user?.id ? (
                        <select
                          value={participant.role || 'Attendee'}
                          onChange={(event) => updateRole(participant.id, event.target.value)}
                          className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
                        >
                          <option value="Attendee">Attendee</option>
                          <option value="Presenter">Presenter</option>
                          <option value="Organizer">Organizer</option>
                        </select>
                      ) : (
                        <span className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">{participant.role || 'Attendee'}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {participant.isAudioEnabled ? 'Audio on' : 'Muted'} - {participant.isVideoEnabled ? 'Video on' : 'Video off'}
                      {participant.isScreenSharing ? ' - Presenting' : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {isOrganizer && (
            <section className="rounded-md border border-white/10 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Lobby</h2>
                <button onClick={refreshLobby} className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:bg-white/5">
                  Refresh
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {lobbyRequests.filter((request) => request.status === 'Waiting').length === 0 ? (
                  <p className="text-sm text-slate-400">No one is waiting.</p>
                ) : (
                  lobbyRequests
                    .filter((request) => request.status === 'Waiting')
                    .map((request) => (
                      <div key={request.id} className="rounded-md bg-slate-800 px-3 py-2">
                        <p className="text-sm font-medium">{request.userName}</p>
                        <p className="text-xs text-slate-400">{request.userEmail}</p>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => decideLobby(request.id, true)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                            Admit
                          </button>
                          <button onClick={() => decideLobby(request.id, false)} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                            Deny
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </section>
          )}

          <section className="rounded-md border border-white/10 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Meeting notes</h2>
            <textarea
              value={meetingNotes}
              onChange={(event) => setMeetingNotes(event.target.value)}
              disabled={!isOrganizer}
              rows={5}
              placeholder="Capture decisions, follow-ups, and recap notes"
              className="mt-3 w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
            />
            {isOrganizer && (
              <button onClick={saveNotes} className="mt-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Save notes
              </button>
            )}
          </section>

          <section className="rounded-md border border-white/10 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Chat</h2>
              <select
                value={chatRecipient}
                onChange={(event) => setChatRecipient(event.target.value)}
                disabled={!hasJoined}
                className="max-w-[170px] rounded-md border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white outline-none disabled:opacity-50"
              >
                <option value="everyone">Everyone</option>
                {participants
                  .filter((participant) => participant.userId && participant.userId !== user?.id)
                  .map((participant) => (
                    <option key={participant.id} value={participant.userId}>
                      {participant.userName}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-3 flex h-64 flex-col gap-2 overflow-y-auto rounded-md bg-slate-950 p-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-slate-400">No messages yet.</p>
              ) : (
                chatMessages.map((message) => {
                  const isMine = message.senderId === user?.id;
                  return (
                    <div key={message.id} className={`max-w-[90%] rounded-md px-3 py-2 text-sm ${isMine ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs opacity-80">
                        <span>{isMine ? 'You' : message.senderName}</span>
                        <span>{message.scope === 'direct' ? `Direct${message.recipientName ? ` to ${message.recipientName}` : ''}` : 'Everyone'}</span>
                      </div>
                      {renderChatMessageText(message.message, isMine)}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendChat();
                    return;
                  }

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const nextDraft = `${chatDraft.slice(0, start)}  ${chatDraft.slice(end)}`;
                    setChatDraft(nextDraft);
                    window.requestAnimationFrame(() => {
                      target.selectionStart = start + 2;
                      target.selectionEnd = start + 2;
                    });
                  }
                }}
                rows={Math.min(5, Math.max(2, chatDraft.split('\n').length))}
                disabled={!hasJoined}
                placeholder={hasJoined ? 'Type a message' : 'Join to chat'}
                className="max-h-32 min-w-0 flex-1 resize-none rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
              />
              <button
                onClick={handleSendChat}
                disabled={!hasJoined || !chatDraft.trim()}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-slate-900 p-4">
            <h2 className="text-base font-semibold">Activity</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {activity.length === 0 ? <p className="text-slate-400">Activity will appear here.</p> : activity.map((item, index) => <p key={index}>{item}</p>)}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
