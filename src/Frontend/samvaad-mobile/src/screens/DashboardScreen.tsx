import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, Field, LoadingState, Screen } from '../components/Ui';
import { calendarAPI, meetingAPI } from '../services/api';
import { spacing } from '../theme/theme';
import { Meeting } from '../types/api';

function statusTone(status?: string) {
  if (status === 'Ongoing') return 'success';
  if (status === 'Completed') return 'info';
  if (status === 'Cancelled') return 'danger';
  return 'warning';
}

export default function DashboardScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [form, setForm] = useState({
    title: '',
    startTime: new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16),
    durationMinutes: '30',
    attendees: '',
  });

  const meetings = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => (await meetingAPI.getUpcomingMeetings()).data as Meeting[],
  });

  const calendarConnections = useQuery({
    queryKey: ['calendar-connections'],
    queryFn: async () => (await calendarAPI.getConnections()).data,
  });

  const createMeeting = useMutation({
    mutationFn: () => meetingAPI.createMeeting({
      title: form.title || 'New meeting',
      startTime: new Date(form.startTime).toISOString(),
      durationMinutes: Number(form.durationMinutes) || 30,
      attendeeEmails: form.attendees.split(',').map((item) => item.trim()).filter(Boolean),
      lobbyEnabled: true,
      chatEnabled: true,
      screenSharingEnabled: true,
    }),
    onSuccess: () => {
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error: any) => Alert.alert('Meeting not created', error?.response?.data?.message || error.message),
  });

  const grouped = useMemo(() => {
    const list = meetings.data || [];
    return list.reduce<Record<string, Meeting[]>>((acc, meeting) => {
      const key = new Date(meeting.startTime).toDateString();
      acc[key] = [...(acc[key] || []), meeting];
      return acc;
    }, {});
  }, [meetings.data]);

  return (
    <Screen>
      <AppHeader title="Today" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="New meeting" icon="+" onPress={() => setShowCreate(true)} />
          <Button label={view === 'week' ? 'Month' : 'Week'} variant="secondary" onPress={() => setView(view === 'week' ? 'month' : 'week')} />
          <Button label="License" variant="secondary" onPress={() => navigation.navigate('License')} />
        </View>
        <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
          <Button label="Tasks" variant="secondary" onPress={() => navigation.navigate('Tasks')} />
          <Button label="Files" variant="secondary" onPress={() => navigation.navigate('Files')} />
          <Button label="Recordings" variant="secondary" onPress={() => navigation.navigate('Recordings')} />
          <Button label="Profile" variant="secondary" onPress={() => navigation.navigate('Profile')} />
          <Button label="Org settings" variant="secondary" onPress={() => navigation.navigate('OrganizationSettings')} />
        </ScrollView>
        {meetings.isLoading ? <LoadingState /> : null}
        {!meetings.isLoading && !meetings.data?.length ? <EmptyState title="No meetings" message="Schedule one or start a call from chat." /> : null}
        {Object.entries(grouped).slice(0, view === 'week' ? 7 : 31).map(([day, items]) => (
          <Card key={day} style={{ gap: spacing.sm }}>
            <AppText title style={{ fontSize: 17 }}>{day}</AppText>
            {items.map((meeting) => (
              <Pressable key={meeting.id} onPress={() => navigation.navigate('MeetingRoom', { meetingId: meeting.id })}>
                <Card style={{ backgroundColor: 'transparent', gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                    <AppText style={{ fontWeight: '800', flex: 1 }}>{meeting.title}</AppText>
                    <Badge label={meeting.status || 'Scheduled'} tone={statusTone(meeting.status) as any} />
                  </View>
                  <AppText muted>
                    {new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {meeting.durationMinutes || 30} min
                  </AppText>
                </Card>
              </Pressable>
            ))}
          </Card>
        ))}
        <Card style={{ gap: spacing.sm }}>
          <AppText title style={{ fontSize: 17 }}>Calendar sync</AppText>
          <AppText muted>Outlook and Google connections are managed through the existing Samvaad calendar APIs.</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(calendarConnections.data || []).length
              ? (calendarConnections.data || []).map((item: any) => <Badge key={item.provider} label={`${item.provider}: ${item.status || 'Connected'}`} tone="success" />)
              : <Badge label="No provider connected" tone="warning" />}
          </View>
        </Card>
      </ScrollView>
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <AppText title>Schedule meeting</AppText>
            <Field label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
            <Field label="Start time" value={form.startTime} onChangeText={(startTime) => setForm({ ...form, startTime })} />
            <Field label="Duration minutes" keyboardType="numeric" value={form.durationMinutes} onChangeText={(durationMinutes) => setForm({ ...form, durationMinutes })} />
            <Field label="Attendees" multiline placeholder="alex@samvaad.test, priya@samvaad.test" value={form.attendees} onChangeText={(attendees) => setForm({ ...form, attendees })} />
            <Button label="Create" disabled={createMeeting.isPending} onPress={() => createMeeting.mutate()} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowCreate(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
