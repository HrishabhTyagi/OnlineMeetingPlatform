import React, { useMemo } from 'react';
import { FlatList, Pressable, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, Screen, SectionHeader } from '../components/Ui';
import { meetingAPI, openProtectedApiAsset } from '../services/api';
import { spacing } from '../theme/theme';
import { Meeting } from '../types/api';

export default function RecordingsScreen({ navigation }: any) {
  const meetings = useQuery({
    queryKey: ['recording-meetings'],
    queryFn: async () => (await meetingAPI.getMyMeetings()).data as Meeting[],
  });

  const recordingMeetings = useMemo(() => (meetings.data || []).filter((meeting: any) => {
    return meeting.recordingUrl || meeting.recordings?.length || meeting.status === 'Completed';
  }), [meetings.data]);

  return (
    <Screen>
      <AppHeader title="Recordings" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        <Card style={{ gap: spacing.sm }}>
          <SectionHeader title="Meeting recordings" />
          <AppText muted>Open protected recordings, related chats, whiteboard exports, and completed meeting history.</AppText>
        </Card>
        <FlatList
          data={recordingMeetings}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState title="No recordings" message="Recorded meetings will appear here after upload or sync." />}
          renderItem={({ item }: any) => (
            <Pressable onPress={() => navigation.navigate('MeetingRoom', { meetingId: item.id })}>
              <Card style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
                <AppText style={{ fontWeight: '800' }}>{item.title}</AppText>
                <AppText muted>{new Date(item.startTime).toLocaleString()} · {item.durationMinutes || 60} min</AppText>
                <Badge label={item.status || 'Completed'} tone={item.status === 'Completed' ? 'success' : 'info'} />
                <Button label="Open recording" disabled={!item.recordingUrl && !item.recordings?.[0]?.url} onPress={() => openProtectedApiAsset(item.recordingUrl || item.recordings?.[0]?.url)} />
              </Card>
            </Pressable>
          )}
        />
      </ScrollView>
    </Screen>
  );
}
