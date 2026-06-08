import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { initializeSignalR, onSignalR, realtime, startSignalR } from '../services/signalR';
import { navigateToMeeting, navigateToScreen } from '../services/navigation';
import { registerPushDevice, showLocalNotification } from '../services/notifications';

function getMeetingId(data: any) {
  return data?.meetingId || data?.MeetingId || data?.id || data?.Id;
}

export default function NotificationBridge() {
  const { session, user } = useAuth();

  useEffect(() => {
    if (!session?.token || !user?.id) {
      return undefined;
    }

    let disposed = false;
    const disposers: Array<() => void> = [];

    registerPushDevice().catch(() => undefined);
    initializeSignalR(session.token);
    startSignalR()
      .then(() => {
        if (disposed) return;
        realtime.joinUser(user.id).catch(() => undefined);

        disposers.push(onSignalR('IncomingCall', (data: any) => {
          showLocalNotification(
            `${data?.callerName || 'Someone'} is calling`,
            data?.callType === 'audio' ? 'Audio call' : 'Video call',
            { type: 'call', meetingId: getMeetingId(data) },
          );
        }));

        disposers.push(onSignalR('MeetingInvite', (data: any) => {
          showLocalNotification(
            'Meeting invite',
            data?.title || data?.meetingTitle || 'You have been invited to a meeting.',
            { type: 'meeting', meetingId: getMeetingId(data) },
          );
        }));

        disposers.push(onSignalR('ConversationMessage', (data: any) => {
          showLocalNotification(
            data?.senderName || 'New message',
            data?.message || 'You have a new Samvaad message.',
            { type: 'chat', conversationId: data?.conversationId },
          );
        }));

        disposers.push(onSignalR('TaskAssigned', (data: any) => {
          showLocalNotification(
            'Task assigned',
            data?.title || 'A task was assigned to you.',
            { type: 'tasks' },
          );
        }));

        disposers.push(onSignalR('MeetingEnded', (data: any) => {
          showLocalNotification(
            'Meeting ended',
            data?.title || 'The organizer ended the meeting.',
            { type: 'meeting-ended', meetingId: getMeetingId(data) },
          );
        }));
      })
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.meetingId) {
        navigateToMeeting(String(data.meetingId));
        return;
      }
      if (data?.type === 'tasks') {
        navigateToScreen('Tasks');
      }
    });

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
      subscription.remove();
    };
  }, [session?.token, user?.id]);

  return null;
}
