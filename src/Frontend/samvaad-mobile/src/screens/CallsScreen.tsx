import React, { useEffect } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Avatar, Badge, Button, Card, EmptyState, Screen } from '../components/Ui';
import { useAuth } from '../context/AuthContext';
import { meetingAPI } from '../services/api';
import { initializeSignalR, onSignalR, realtime, startSignalR } from '../services/signalR';
import { spacing } from '../theme/theme';

export default function CallsScreen({ navigation }: any) {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const calls = useQuery({
    queryKey: ['recent-calls'],
    queryFn: async () => (await meetingAPI.getRecentCallLogs()).data,
  });

  useEffect(() => {
    if (!session?.token || !user?.id) return;
    initializeSignalR(session.token);
    startSignalR().then(() => realtime.joinUser(user.id)).catch(() => undefined);
    return onSignalR('IncomingCall', (data) => {
      Alert.alert(`${data.callerName} is calling`, data.callType || 'Video call', [
        { text: 'Decline', style: 'cancel', onPress: () => realtime.respondToCall(data.conversationId, data.meetingId, data.callLogId, data.callerUserId, user.id, user.displayName || user.email, 'Declined') },
        { text: 'Accept', onPress: () => navigation.navigate('MeetingRoom', { meetingId: data.meetingId }) },
      ]);
      queryClient.invalidateQueries({ queryKey: ['recent-calls'] });
    });
  }, [session?.token, user?.id]);

  return (
    <Screen>
      <AppHeader title="Calls" />
      <FlatList
        data={calls.data || []}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListEmptyComponent={<EmptyState title="No calls" message="Missed, accepted, declined, and no-response calls appear here." />}
        renderItem={({ item }: any) => (
          <Pressable onPress={() => item.meetingId && navigation.navigate('MeetingRoom', { meetingId: item.meetingId })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Avatar name={item.callerName || item.recipientName} />
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '800' }}>{item.callerName || item.recipientName || 'Call'}</AppText>
                <AppText muted>{item.status || 'NoResponse'} · {item.callType || 'video'}</AppText>
              </View>
              <Badge label={item.seen ? 'Seen' : 'New'} tone={item.seen ? 'info' : 'danger'} />
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
