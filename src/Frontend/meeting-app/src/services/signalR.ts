import * as signalR from '@microsoft/signalr';

const NOTIFICATION_HUB_URL = 'http://localhost:5000/hubs/notifications';

let connection: signalR.HubConnection | null = null;
let activeToken: string | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;

export const initializeSignalR = (token: string) => {
  if (connection && activeToken === token) {
    return connection;
  }

  if (connection && activeToken !== token) {
    connection.stop().catch(() => undefined);
    connection = null;
    startPromise = null;
  }

  activeToken = token;
  connection = new signalR.HubConnectionBuilder()
    .withUrl(NOTIFICATION_HUB_URL, {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect()
    .withHubProtocol(new signalR.JsonHubProtocol())
    .configureLogging(signalR.LogLevel.Information)
    .build();

  connection.onreconnecting((error) => {
    console.log('Reconnecting...', error);
  });

  connection.onreconnected((connectionId) => {
    console.log('Reconnected with connection ID:', connectionId);
  });

  connection.onclose((error) => {
    console.log('Connection closed:', error);
  });

  return connection;
};

export const getSignalRConnection = () => connection;

export const startSignalR = async () => {
  if (!connection) {
    return null;
  }

  if (connection.state === signalR.HubConnectionState.Connected) {
    return connection;
  }

  if (startPromise) {
    return startPromise;
  }

  if (connection.state === signalR.HubConnectionState.Disconnected) {
    startPromise = connection.start()
      .then(() => connection)
      .finally(() => {
        startPromise = null;
      });
    return startPromise;
  }

  return connection;
};

export const disconnectSignalR = async () => {
  if (connection) {
    await connection.stop();
    connection = null;
    activeToken = null;
    startPromise = null;
  }
};

export const joinMeetingGroup = async (meetingId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('JoinMeetingGroup', meetingId);
  }
};

export const joinUserNotifications = async (userId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('JoinUserNotifications', userId);
  }
};

export const leaveMeetingGroup = async (meetingId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('LeaveMeetingGroup', meetingId);
  }
};

export const joinConversation = async (conversationId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('JoinConversation', conversationId);
  }
};

export const leaveConversation = async (conversationId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('LeaveConversation', conversationId);
  }
};

export const onParticipantJoined = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ParticipantJoined');
    connection.on('ParticipantJoined', callback);
  }
};

export const onParticipantLeft = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ParticipantLeft');
    connection.on('ParticipantLeft', callback);
  }
};

export const onScreenShareStarted = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ScreenShareStarted');
    connection.on('ScreenShareStarted', callback);
  }
};

export const onScreenShareEnded = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ScreenShareEnded');
    connection.on('ScreenShareEnded', callback);
  }
};

export const onMeetingInvite = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('MeetingInvite');
    connection.on('MeetingInvite', callback);
  }
};

export const onMeetingEnded = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('MeetingEnded');
    connection.on('MeetingEnded', callback);
  }
};

export const onMeetingIntelligenceReady = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('MeetingIntelligenceReady');
    connection.on('MeetingIntelligenceReady', callback);
  }
};

export const onWhiteboardUpdated = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('WhiteboardUpdated');
    connection.on('WhiteboardUpdated', callback);
  }
};

export const notifyParticipantJoined = async (meetingId: string, participantName: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyParticipantJoined', meetingId, participantName);
  }
};

export const notifyParticipantLeft = async (meetingId: string, participantName: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyParticipantLeft', meetingId, participantName);
  }
};

export const notifyMeetingEnded = async (meetingId: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyMeetingEnded', meetingId);
  }
};

export const notifyWhiteboardUpdated = async (
  meetingId: string,
  userId: string,
  userName: string,
  whiteboardData: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyWhiteboardUpdated', meetingId, userId, userName, whiteboardData);
  }
};

export const notifyParticipantMediaStatusChanged = async (
  meetingId: string,
  userId: string,
  participantName: string,
  audioEnabled: boolean,
  videoEnabled: boolean,
  screenSharing: boolean,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'NotifyParticipantMediaStatusChanged',
      meetingId,
      userId,
      participantName,
      audioEnabled,
      videoEnabled,
      screenSharing,
    );
  }
};

export const notifyParticipantEngagementChanged = async (
  meetingId: string,
  userId: string,
  participantName: string,
  isHandRaised: boolean,
  reaction?: string | null,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'NotifyParticipantEngagementChanged',
      meetingId,
      userId,
      participantName,
      isHandRaised,
      reaction || null,
    );
  }
};

export const notifyLobbyRequest = async (
  meetingId: string,
  requestId: string,
  userId: string,
  userName: string,
  userEmail: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyLobbyRequest', meetingId, requestId, userId, userName, userEmail);
  }
};

export const notifyLobbyDecision = async (
  meetingId: string,
  userId: string,
  userName: string,
  admitted: boolean,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyLobbyDecision', meetingId, userId, userName, admitted);
  }
};

export const sendMeetingChatMessage = async (
  meetingId: string,
  senderId: string,
  senderName: string,
  message: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendMeetingChatMessage', meetingId, senderId, senderName, message);
  }
};

export const sendDirectChatMessage = async (
  meetingId: string,
  recipientUserId: string,
  senderId: string,
  senderName: string,
  recipientName: string,
  message: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendDirectChatMessage', meetingId, recipientUserId, senderId, senderName, recipientName, message);
  }
};

export const sendConversationMessage = async (
  conversationId: string,
  messageId: string,
  senderId: string,
  senderName: string,
  message: string,
  recipientUserIds: string[],
  attachment?: {
    attachmentFileName?: string;
    attachmentUrl?: string;
    attachmentContentType?: string;
    attachmentSizeBytes?: number;
  },
  reply?: {
    replyToMessageId?: string;
    replyToSenderName?: string;
    replyToPreview?: string;
  },
  isImportant = false,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendConversationMessage',
      conversationId,
      messageId,
      senderId,
      senderName,
      message,
      recipientUserIds,
      attachment?.attachmentFileName || null,
      attachment?.attachmentUrl || null,
      attachment?.attachmentContentType || null,
      attachment?.attachmentSizeBytes || null,
      reply?.replyToMessageId || null,
      reply?.replyToSenderName || null,
      reply?.replyToPreview || null,
      isImportant,
    );
  }
};

export const sendIncomingCall = async (
  conversationId: string,
  meetingId: string,
  callerUserId: string,
  callerName: string,
  callType: 'audio' | 'video',
  joinUrl: string,
  recipientUserIds: string[],
  callLogId?: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendIncomingCall',
      conversationId,
      meetingId,
      callerUserId,
      callerName,
      callType,
      joinUrl,
      recipientUserIds,
      callLogId || null,
    );
  }
};

export const sendIncomingCallCancelled = async (
  conversationId: string,
  meetingId: string,
  callerUserId: string,
  callerName: string,
  recipientUserId: string,
  message: string,
  reason = 'Cancelled',
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendIncomingCallCancelled',
      conversationId,
      meetingId,
      callerUserId,
      callerName,
      recipientUserId,
      message,
      reason,
    );
    return true;
  }

  return false;
};

export const sendIncomingCallResponse = async (
  conversationId: string,
  meetingId: string,
  callLogId: string | null | undefined,
  callerUserId: string,
  recipientUserId: string,
  recipientName: string,
  status: 'Accepted' | 'Declined' | 'NoResponse',
  reason?: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendIncomingCallResponse',
      conversationId,
      meetingId,
      callLogId || null,
      callerUserId,
      recipientUserId,
      recipientName,
      status,
      reason || null,
    );
  }
};

export const sendConversationMessageUpdated = async (
  conversationId: string,
  messageId: string,
  senderId: string,
  senderName: string,
  message: string,
  editedAt: string,
  recipientUserIds: string[],
  isImportant = false,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendConversationMessageUpdated',
      conversationId,
      messageId,
      senderId,
      senderName,
      message,
      editedAt,
      recipientUserIds,
      isImportant,
    );
  }
};

export const sendConversationMessageReactionUpdated = async (
  conversationId: string,
  messageId: string,
  reactions: any[],
  recipientUserIds: string[],
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke(
      'SendConversationMessageReactionUpdated',
      conversationId,
      messageId,
      reactions,
      recipientUserIds,
    );
  }
};

export const notifyUserStatusChanged = async (
  userId: string,
  userName: string,
  status: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('NotifyUserStatusChanged', userId, userName, status);
  }
};

export const sendWebRtcOffer = async (
  meetingId: string,
  senderUserId: string,
  targetUserId: string,
  sdp: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendWebRtcOffer', meetingId, senderUserId, targetUserId, sdp);
  }
};

export const sendWebRtcAnswer = async (
  meetingId: string,
  senderUserId: string,
  targetUserId: string,
  sdp: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendWebRtcAnswer', meetingId, senderUserId, targetUserId, sdp);
  }
};

export const sendWebRtcIceCandidate = async (
  meetingId: string,
  senderUserId: string,
  targetUserId: string,
  candidate: string,
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendWebRtcIceCandidate', meetingId, senderUserId, targetUserId, candidate);
  }
};

export const onMeetingChatMessage = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('MeetingChatMessage');
    connection.on('MeetingChatMessage', callback);
  }
};

export const onDirectChatMessage = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('DirectChatMessage');
    connection.on('DirectChatMessage', callback);
  }
};

export const onWebRtcOffer = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('WebRtcOffer');
    connection.on('WebRtcOffer', callback);
  }
};

export const onWebRtcAnswer = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('WebRtcAnswer');
    connection.on('WebRtcAnswer', callback);
  }
};

export const onWebRtcIceCandidate = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('WebRtcIceCandidate');
    connection.on('WebRtcIceCandidate', callback);
  }
};

export const onParticipantMediaStatusChanged = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ParticipantMediaStatusChanged');
    connection.on('ParticipantMediaStatusChanged', callback);
  }
};

export const onParticipantEngagementChanged = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('ParticipantEngagementChanged');
    connection.on('ParticipantEngagementChanged', callback);
  }
};

export const onLobbyRequestReceived = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('LobbyRequestReceived');
    connection.on('LobbyRequestReceived', callback);
  }
};

export const onLobbyDecisionReceived = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('LobbyDecisionReceived');
    connection.on('LobbyDecisionReceived', callback);
  }
};

export const onConversationMessageReceived = (callback: (data: any) => void) => {
  if (connection) {
    connection.on('ConversationMessageReceived', callback);
    return () => {
      connection?.off('ConversationMessageReceived', callback);
    };
  }

  return () => undefined;
};

export const onIncomingCall = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('IncomingCall');
    connection.on('IncomingCall', callback);
  }
};

export const onIncomingCallCancelled = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('IncomingCallCancelled');
    connection.on('IncomingCallCancelled', callback);
  }
};

export const onIncomingCallResponse = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('IncomingCallResponse');
    connection.on('IncomingCallResponse', callback);
  }
};

export const onConversationMessageUpdated = (callback: (data: any) => void) => {
  if (connection) {
    connection.on('ConversationMessageUpdated', callback);
    return () => {
      connection?.off('ConversationMessageUpdated', callback);
    };
  }

  return () => undefined;
};

export const onConversationMessageReactionUpdated = (callback: (data: any) => void) => {
  if (connection) {
    connection.on('ConversationMessageReactionUpdated', callback);
    return () => {
      connection?.off('ConversationMessageReactionUpdated', callback);
    };
  }

  return () => undefined;
};

export const onUserStatusChanged = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('UserStatusChanged');
    connection.on('UserStatusChanged', callback);
  }
};
