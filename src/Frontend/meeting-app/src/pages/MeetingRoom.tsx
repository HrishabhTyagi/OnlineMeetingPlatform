import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { meetingAPI } from '../services/api';
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
  onDirectChatMessage,
  onLobbyDecisionReceived,
  onLobbyRequestReceived,
  onMeetingChatMessage,
  onParticipantJoined,
  onParticipantLeft,
  onParticipantMediaStatusChanged,
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

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const currentParticipantRef = useRef<Participant | null>(null);

  const displayName = useMemo(() => {
    if (!user) {
      return 'Guest';
    }

    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }, [user]);

  const isOrganizer = meeting?.organizerId === user?.id || currentParticipant?.role === 'Organizer';

  const currentUserId = user?.id || currentParticipant?.userId || '';

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
    if (!id) {
      return;
    }

    const loadMeeting = async () => {
      try {
        const [meetingResponse, participantsResponse, chatResponse] = await Promise.all([
          meetingAPI.getMeeting(id),
          meetingAPI.getParticipants(id),
          meetingAPI.getChatMessages(id).catch(() => ({ data: [] })),
        ]);
        setMeeting(meetingResponse.data);
        setMeetingNotes(meetingResponse.data.notes || '');
        setParticipants(participantsResponse.data);
        setChatMessages(chatResponse.data.map((message: any) => ({
          id: message.id,
          scope: message.scope === 'Direct' ? 'direct' : 'group',
          senderId: message.senderId,
          senderName: message.senderName,
          recipientUserId: message.recipientUserId,
          recipientName: message.recipientName,
          message: message.message,
          timestamp: message.sentAt,
        })));
      } catch (err: any) {
        setError(err.response?.data || 'Unable to load meeting');
      } finally {
        setLoading(false);
      }
    };

    loadMeeting();
  }, [id]);

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
      Object.values(peerConnectionsRef.current).map(async (connection) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(track);
        }
      }),
    );
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
  }, [id, isOrganizer, token, user?.id]);

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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setLocalStream(stream);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = audioEnabled;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = videoEnabled;
        });
      } catch {
        setActivity((items) => ['Camera or microphone permission was not granted', ...items].slice(0, 5));
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
      setRemoteStreams([]);
      await meetingAPI.leaveMeeting(id, currentParticipant.id);
      await notifyParticipantLeft(id, displayName);
    } finally {
      navigate('/dashboard', { replace: true });
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
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = nextVideo;
    });

    if (updates.sharing !== undefined) {
      if (nextSharing) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          stream.getVideoTracks()[0]?.addEventListener('ended', () => {
            setScreenStream(null);
            setScreenSharing(false);
            replaceOutgoingVideoTrack(localStreamRef.current?.getVideoTracks()[0] || null).catch(() => undefined);
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
        await replaceOutgoingVideoTrack(localStreamRef.current?.getVideoTracks()[0] || null);
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
    if (!id || !currentParticipant || !chatDraft.trim()) {
      return;
    }

    const message = chatDraft.trim();
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
          <button
            onClick={handleLeave}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {hasJoined ? 'Leave' : 'Close'}
          </button>
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
                      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-3xl font-semibold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
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
          </div>
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
              {meeting.meetingLink && (
                <button
                  onClick={() => navigator.clipboard.writeText(meeting.meetingLink || window.location.href)}
                  className="rounded-md border border-white/10 px-3 py-2 text-left text-xs text-slate-200 hover:bg-white/5"
                >
                  Copy join link
                </button>
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
                      <p className="text-sm font-medium">{participant.userName}</p>
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
                      <p>{message.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSendChat();
                  }
                }}
                disabled={!hasJoined}
                placeholder={hasJoined ? 'Type a message' : 'Join to chat'}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
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
