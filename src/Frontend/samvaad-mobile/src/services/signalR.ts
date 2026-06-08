import * as signalR from '@microsoft/signalr';
import { API_ORIGIN } from './api';

let connection: signalR.HubConnection | null = null;
let tokenRef: string | null = null;

export function initializeSignalR(token: string) {
  if (connection && tokenRef === token) {
    return connection;
  }

  if (connection) {
    connection.stop().catch(() => undefined);
  }

  tokenRef = token;
  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_ORIGIN}/hubs/notifications`, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .withHubProtocol(new signalR.JsonHubProtocol())
    .build();

  return connection;
}

export async function startSignalR() {
  if (!connection || connection.state !== signalR.HubConnectionState.Disconnected) {
    return connection;
  }

  await connection.start();
  return connection;
}

export function onSignalR(eventName: string, callback: (...args: any[]) => void) {
  if (!connection) {
    return () => undefined;
  }

  connection.off(eventName);
  connection.on(eventName, callback);
  return () => connection?.off(eventName, callback);
}

export async function invokeSignalR(methodName: string, ...args: any[]) {
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
    return false;
  }

  await connection.invoke(methodName, ...args);
  return true;
}

export const realtime = {
  joinUser: (userId: string) => invokeSignalR('JoinUserNotifications', userId),
  joinMeeting: (meetingId: string) => invokeSignalR('JoinMeetingGroup', meetingId),
  joinConversation: (conversationId: string) => invokeSignalR('JoinConversation', conversationId),
  sendIncomingCall: (conversationId: string, meetingId: string, callerUserId: string, callerName: string, callType: 'audio' | 'video', joinUrl: string, recipientUserIds: string[], callLogId?: string) =>
    invokeSignalR('SendIncomingCall', conversationId, meetingId, callerUserId, callerName, callType, joinUrl, recipientUserIds, callLogId || null),
  cancelIncomingCall: (conversationId: string, meetingId: string, callerUserId: string, callerName: string, recipientUserId: string, message: string) =>
    invokeSignalR('SendIncomingCallCancelled', conversationId, meetingId, callerUserId, callerName, recipientUserId, message, 'Cancelled'),
  respondToCall: (conversationId: string, meetingId: string, callLogId: string | null | undefined, callerUserId: string, recipientUserId: string, recipientName: string, status: string, reason?: string) =>
    invokeSignalR('SendIncomingCallResponse', conversationId, meetingId, callLogId || null, callerUserId, recipientUserId, recipientName, status, reason || null),
  meetingChat: (meetingId: string, senderId: string, senderName: string, message: string) =>
    invokeSignalR('SendMeetingChatMessage', meetingId, senderId, senderName, message),
  conversationMessage: (conversationId: string, messageId: string, senderId: string, senderName: string, message: string, recipientUserIds: string[]) =>
    invokeSignalR('SendConversationMessage', conversationId, messageId, senderId, senderName, message, recipientUserIds, null, null, null, null, null, null, null, false),
  engagement: (meetingId: string, userId: string, userName: string, isHandRaised: boolean, reaction?: string) =>
    invokeSignalR('NotifyParticipantEngagementChanged', meetingId, userId, userName, isHandRaised, reaction || null),
  media: (meetingId: string, userId: string, userName: string, audio: boolean, video: boolean, sharing: boolean) =>
    invokeSignalR('NotifyParticipantMediaStatusChanged', meetingId, userId, userName, audio, video, sharing),
  whiteboard: (meetingId: string, userId: string, userName: string, whiteboardData: string) =>
    invokeSignalR('NotifyWhiteboardUpdated', meetingId, userId, userName, whiteboardData),
  meetingEnded: (meetingId: string) =>
    invokeSignalR('NotifyMeetingEnded', meetingId),
};
