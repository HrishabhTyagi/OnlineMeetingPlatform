import * as signalR from '@microsoft/signalr';

const NOTIFICATION_HUB_URL = 'http://localhost:5000/hubs/notifications';

let connection: signalR.HubConnection | null = null;

export const initializeSignalR = (token: string) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    return connection;
  }

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

  if (connection.state === signalR.HubConnectionState.Disconnected) {
    await connection.start();
  }

  return connection;
};

export const disconnectSignalR = async () => {
  if (connection) {
    await connection.stop();
    connection = null;
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
  senderId: string,
  senderName: string,
  message: string,
  recipientUserIds: string[],
) => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    await connection.invoke('SendConversationMessage', conversationId, senderId, senderName, message, recipientUserIds);
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
    connection.off('ConversationMessageReceived');
    connection.on('ConversationMessageReceived', callback);
  }
};

export const onUserStatusChanged = (callback: (data: any) => void) => {
  if (connection) {
    connection.off('UserStatusChanged');
    connection.on('UserStatusChanged', callback);
  }
};
