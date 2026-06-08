import React, { useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Avatar, Badge, Button, Card, EmptyState, Field, LoadingState, Screen } from '../components/Ui';
import { meetingAPI, openProtectedApiAsset, userAPI } from '../services/api';
import { requestMeetingMedia, stopMeetingMedia } from '../services/mobileWebRtc';
import { initializeSignalR, onSignalR, realtime, startSignalR } from '../services/signalR';
import { spacing } from '../theme/theme';
import { MeetingParticipant } from '../types/api';
import { useAuth } from '../context/AuthContext';

export default function MeetingRoomScreen({ route, navigation }: any) {
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const meetingId = route.params?.meetingId || '';
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [tab, setTab] = useState<'people' | 'chat' | 'details' | 'whiteboard' | 'recordings' | 'invites'>('people');
  const [message, setMessage] = useState('');
  const [chatAttachment, setChatAttachment] = useState<any>(null);
  const [whiteboard, setWhiteboard] = useState('');
  const [notes, setNotes] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [callUserQuery, setCallUserQuery] = useState('');
  const [showLeave, setShowLeave] = useState(false);
  const [media, setMedia] = useState({ audio: true, video: false, sharing: false, recording: false });

  const meeting = useQuery({
    queryKey: ['meeting', meetingId],
    enabled: Boolean(meetingId),
    queryFn: async () => (await meetingAPI.getMeeting(meetingId)).data,
  });

  const participants = useQuery({
    queryKey: ['participants', meetingId],
    enabled: Boolean(meetingId),
    queryFn: async () => (await meetingAPI.getParticipants(meetingId)).data as MeetingParticipant[],
  });

  const chat = useQuery({
    queryKey: ['meeting-chat', meetingId],
    enabled: Boolean(meetingId),
    queryFn: async () => (await meetingAPI.getChatMessages(meetingId)).data,
  });

  const people = useQuery({
    queryKey: ['users', callUserQuery],
    enabled: callUserQuery.length > 1,
    queryFn: async () => (await userAPI.searchUsers(callUserQuery)).data,
  });

  const invites = useQuery({
    queryKey: ['meeting-invites', meetingId],
    enabled: Boolean(meetingId),
    queryFn: async () => (await meetingAPI.getInvites(meetingId)).data,
  });

  useEffect(() => {
    if (meeting.data?.whiteboardData && !whiteboard) {
      setWhiteboard(meeting.data.whiteboardData);
    }
    if (meeting.data?.notes && !notes) {
      setNotes(meeting.data.notes);
    }
  }, [meeting.data?.id]);

  useEffect(() => {
    if (!session?.token || !meetingId) return;
    initializeSignalR(session.token);
    startSignalR().then(() => realtime.joinMeeting(meetingId)).catch(() => undefined);
    const offJoined = onSignalR('ParticipantJoined', () => participants.refetch());
    const offMedia = onSignalR('ParticipantMediaStatusChanged', () => participants.refetch());
    const offEngagement = onSignalR('ParticipantEngagementChanged', () => participants.refetch());
    const offEnded = onSignalR('MeetingEnded', () => Alert.alert('Meeting ended', 'The organizer ended this meeting.', [{ text: 'OK', onPress: () => navigation.goBack() }]));
    return () => {
      offJoined();
      offMedia();
      offEngagement();
      offEnded();
    };
  }, [session?.token, meetingId]);

  useEffect(() => {
    if (!meetingId || !user?.id || participantId) return;
    meetingAPI.joinMeeting(meetingId, {
      userId: user.id,
      userName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      email: user.email,
    }).then((response) => {
      setParticipantId(response.data?.id || response.data?.participantId || null);
      participants.refetch();
    }).catch(() => undefined);
  }, [meetingId, user?.id]);

  const sortedParticipants = useMemo(() => {
    return [...(participants.data || [])].sort((a, b) => Number(Boolean(b.isHandRaised)) - Number(Boolean(a.isHandRaised)));
  }, [participants.data]);

  const sendChat = useMutation({
    mutationFn: async () => {
      if (chatAttachment?.uri) {
        const data = new FormData();
        data.append('message', message);
        data.append('file', {
          uri: chatAttachment.uri,
          name: chatAttachment.name || 'attachment',
          type: chatAttachment.mimeType || 'application/octet-stream',
        } as any);
        return (await meetingAPI.uploadChatAttachment(meetingId, data)).data;
      }

      return (await meetingAPI.sendChatMessage(meetingId, { message })).data;
    },
    onSuccess: () => {
      setMessage('');
      setChatAttachment(null);
      queryClient.invalidateQueries({ queryKey: ['meeting-chat', meetingId] });
      realtime.meetingChat(meetingId, user!.id, user?.displayName || user?.email || 'User', message);
    },
  });

  const pickMeetingDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (!result.canceled) setChatAttachment(result.assets[0]);
  };

  const pickMeetingImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setChatAttachment({ ...result.assets[0], name: 'screenshot.jpg', mimeType: 'image/jpeg' });
  };

  const toggleHand = async () => {
    if (!participantId) return;
    const mine = participants.data?.find((item) => item.id === participantId);
    await meetingAPI.updateParticipantHand(meetingId, participantId, { isHandRaised: !mine?.isHandRaised });
    await realtime.engagement(meetingId, user!.id, user?.displayName || user?.email || 'User', !mine?.isHandRaised);
    participants.refetch();
  };

  const react = async (reaction: string) => {
    if (!participantId) return;
    await meetingAPI.updateParticipantReaction(meetingId, participantId, { reaction });
    await realtime.engagement(meetingId, user!.id, user?.displayName || user?.email || 'User', false, reaction);
    participants.refetch();
  };

  const toggleMedia = async (kind: 'audio' | 'video' | 'screen') => {
    const isStoppingVideo = kind === 'video' && media.video;
    const isStoppingScreen = kind === 'screen' && media.sharing;
    const nextNative = isStoppingVideo || isStoppingScreen
      ? { audioEnabled: media.audio, videoEnabled: false, screenSharing: false }
      : await requestMeetingMedia(kind);
    const next = kind === 'audio'
      ? { ...media, audio: !media.audio }
      : kind === 'video'
        ? { ...media, video: !media.video, audio: nextNative.audioEnabled || media.audio }
        : { ...media, sharing: !media.sharing };
    if (isStoppingVideo) {
      stopMeetingMedia('video');
    }
    if (isStoppingScreen) {
      stopMeetingMedia('screen');
    }
    setMedia(next);
    if (meetingId && user?.id) {
      await realtime.media(meetingId, user.id, user.displayName || user.email, next.audio, next.video, next.sharing);
    }
  };

  const callPerson = async (target: any) => {
    if (!meetingId || !target?.id || !user?.id) return;
    await realtime.sendIncomingCall('meeting', meetingId, user.id, user.displayName || user.email, 'video', '', [target.id]);
    Alert.alert('Ringing', `${target.displayName || target.email} is being called into this meeting.`);
  };

  const leaveMeeting = async (end = false) => {
    if (end) {
      await meetingAPI.endMeeting(meetingId);
    } else if (participantId) {
      await meetingAPI.leaveMeeting(meetingId, participantId);
    }
    setShowLeave(false);
    navigation.goBack();
  };

  const saveWhiteboard = async () => {
    await meetingAPI.updateWhiteboard(meetingId, { whiteboardData: whiteboard });
    if (user?.id) {
      await realtime.whiteboard(meetingId, user.id, user.displayName || user.email, whiteboard);
    }
    meeting.refetch();
  };

  const saveNotes = async () => {
    await meetingAPI.updateNotes(meetingId, { notes });
    meeting.refetch();
  };

  const sendMeetingInvites = async () => {
    await meetingAPI.sendInvites(meetingId, {
      emails: inviteEmails.split(',').map((item) => item.trim()).filter(Boolean),
      message: 'Please join the ongoing Samvaad meeting.',
    });
    setInviteEmails('');
    invites.refetch();
  };

  if (!meetingId) {
    return (
      <Screen>
        <AppHeader title="Meet" />
        <View style={{ padding: spacing.md }}>
          <EmptyState title="No active meeting" message="Open a meeting from Today, Chat, or Calls." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={meeting.data?.title || 'Meeting'} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: spacing.md, gap: spacing.md }}>
          <Card style={{ flex: 1, minHeight: 260, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
            {sortedParticipants.some((item) => item.isHandRaised) ? <Badge label={`✋ ${sortedParticipants.filter((item) => item.isHandRaised).length} raised`} tone="warning" /> : null}
            <AppText style={{ color: '#fff', fontSize: 20, marginTop: spacing.md }}>Ready in Samvaad</AppText>
            <AppText muted style={{ color: '#cbd5e1', textAlign: 'center' }}>
              Video, audio, screen sharing, recording, reactions, hand raise, whiteboard, and meeting chat controls are available below.
            </AppText>
          </Card>
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
            <Button label={media.audio ? 'Mute' : 'Unmute'} variant="secondary" onPress={() => toggleMedia('audio')} />
            <Button label={media.video ? 'Stop video' : 'Video'} variant="secondary" onPress={() => toggleMedia('video')} />
            <Button label={media.sharing ? 'Stop share' : 'Share'} variant="secondary" onPress={() => toggleMedia('screen')} />
            <Button label={media.recording ? 'Stop recording' : 'Record'} icon="●" variant={media.recording ? 'danger' : 'secondary'} onPress={() => setMedia({ ...media, recording: !media.recording })} />
            <Button label="Raise hand" icon="✋" variant="secondary" onPress={toggleHand} />
            {['👍', '👏', '❤️', '😊', '🎉'].map((item) => <Button key={item} label={item} variant="ghost" onPress={() => react(item)} />)}
            <Button label="Leave" variant="danger" onPress={() => setShowLeave(true)} />
          </ScrollView>
        </View>
        <Card style={{ margin: spacing.md, gap: spacing.sm }}>
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
            {['people', 'chat', 'details', 'whiteboard', 'recordings', 'invites'].map((item) => (
              <Pressable key={item} onPress={() => setTab(item as any)}>
                <Badge label={item} tone={tab === item ? 'success' : 'info'} />
              </Pressable>
            ))}
          </ScrollView>
          {tab === 'people' ? (
            <View style={{ gap: spacing.sm }}>
              <Field placeholder="Call available users directly" value={callUserQuery} onChangeText={setCallUserQuery} />
              {(people.data || []).slice(0, 3).map((person: any) => (
                <Card key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Avatar name={person.displayName || person.email} status={person.status} />
                  <AppText style={{ flex: 1 }}>{person.displayName || person.email}</AppText>
                  <Button label="Call" onPress={() => callPerson(person)} />
                </Card>
              ))}
              <FlatList
                data={sortedParticipants}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Card style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Avatar name={item.userName} status={item.screenSharing ? 'Presenting' : item.status} />
                      <View style={{ flex: 1 }}>
                        <AppText style={{ fontWeight: '800' }}>{item.userName}</AppText>
                        <AppText small muted>{item.screenSharing ? 'Presenting' : item.status || 'In call'} {item.role ? `· ${item.role}` : ''}</AppText>
                      </View>
                      {item.isHandRaised ? <Badge label="✋" tone="warning" /> : null}
                    </View>
                  </Card>
                )}
              />
            </View>
          ) : null}
          {tab === 'chat' ? (
            <View style={{ gap: spacing.sm }}>
              <FlatList
                data={chat.data || []}
                keyExtractor={(item: any) => item.id}
                renderItem={({ item }: any) => (
                  <Card style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    <AppText small muted>{item.senderName}</AppText>
                    {item.message ? <AppText>{item.message}</AppText> : null}
                    {item.attachmentFileName ? <Badge label={`File: ${item.attachmentFileName}`} /> : null}
                    {item.attachmentUrl ? <Button label="Open attachment" variant="secondary" onPress={() => openProtectedApiAsset(item.attachmentUrl)} /> : null}
                  </Card>
                )}
              />
              {chatAttachment ? <Badge label={`Ready: ${chatAttachment.name || 'image'}`} /> : null}
              <Field placeholder="Message meeting" value={message} onChangeText={setMessage} />
              <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
                <Button label="Attach" variant="secondary" onPress={pickMeetingDocument} />
                <Button label="Image" variant="secondary" onPress={pickMeetingImage} />
                {chatAttachment ? <Button label="Remove file" variant="ghost" onPress={() => setChatAttachment(null)} /> : null}
                <Button label="Send" disabled={!message && !chatAttachment} onPress={() => sendChat.mutate()} />
              </ScrollView>
            </View>
          ) : null}
          {tab === 'details' ? (
            <View style={{ gap: spacing.sm }}>
              {meeting.isLoading ? <LoadingState /> : null}
              <AppText>{meeting.data?.description || 'Online meeting'}</AppText>
              <AppText muted>{meeting.data?.durationMinutes || 60} minutes</AppText>
              <Field label="Meeting notes" multiline value={notes} onChangeText={setNotes} />
              <Button label="Save notes" variant="secondary" onPress={saveNotes} />
              <Button label="Export chat" variant="secondary" onPress={() => meetingAPI.exportChat(meetingId)} />
            </View>
          ) : null}
          {tab === 'whiteboard' ? (
            <View style={{ gap: spacing.sm }}>
              <AppText muted>Shared mobile whiteboard. Add text, shapes, arrows, and action notes here; updates sync through the meeting whiteboard endpoint.</AppText>
              <Field label="Whiteboard content" multiline value={whiteboard} onChangeText={setWhiteboard} placeholder="Draw idea: box -> arrow -> action" />
              <Button label="Sync whiteboard" onPress={saveWhiteboard} />
              <Button label="Export whiteboard" variant="secondary" onPress={() => meetingAPI.exportWhiteboard(meetingId)} />
            </View>
          ) : null}
          {tab === 'recordings' ? (
            <View style={{ gap: spacing.sm }}>
              <AppText muted>Recordings are protected by meeting permission. Upload from native recording or open existing recordings.</AppText>
              {(meeting.data?.recordings || []).map((recording: any) => (
                <Card key={recording.id || recording.url} style={{ gap: spacing.sm }}>
                  <AppText>{recording.fileName || 'Recording'}</AppText>
                  <Button label="Open recording" onPress={() => openProtectedApiAsset(recording.url || recording.recordingUrl)} />
                </Card>
              ))}
              {!meeting.data?.recordings?.length && !meeting.data?.recordingUrl ? <EmptyState title="No recordings" message="Start recording during the meeting, then upload or open it here." /> : null}
              {meeting.data?.recordingUrl ? <Button label="Open latest recording" onPress={() => openProtectedApiAsset(meeting.data.recordingUrl)} /> : null}
            </View>
          ) : null}
          {tab === 'invites' ? (
            <View style={{ gap: spacing.sm }}>
              <Field label="Invite people" placeholder="name@example.com, teammate@example.com" multiline value={inviteEmails} onChangeText={setInviteEmails} />
              <Button label="Send join link" disabled={!inviteEmails.trim()} onPress={sendMeetingInvites} />
              {(invites.data || []).map((invite: any) => (
                <Card key={invite.id || invite.email} style={{ gap: spacing.xs }}>
                  <AppText>{invite.email}</AppText>
                  <AppText muted>{invite.responseStatus || invite.status || 'No response'} {invite.responseReason ? `- ${invite.responseReason}` : ''}</AppText>
                </Card>
              ))}
            </View>
          ) : null}
        </Card>
      </View>
      <Modal visible={showLeave} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: '#0008' }}>
          <Card style={{ gap: spacing.md }}>
            <AppText title>Meeting options</AppText>
            <Button label="Leave meeting" onPress={() => leaveMeeting(false)} />
            <Button label="End meeting for everyone" variant="danger" onPress={() => leaveMeeting(true)} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowLeave(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
