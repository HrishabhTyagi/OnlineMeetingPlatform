import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Avatar, Badge, Button, Card, EmptyState, Field, LoadingState, Screen } from '../components/Ui';
import { conversationAPI, meetingAPI } from '../services/api';
import { enqueueMessage, flushOutbox } from '../services/outbox';
import { initializeSignalR, onSignalR, realtime, startSignalR } from '../services/signalR';
import { spacing } from '../theme/theme';
import { ChatMessage, Conversation } from '../types/api';
import { useAuth } from '../context/AuthContext';

export default function ChatScreen() {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'important' | 'pinned' | 'tasks' | 'files' | 'unread'>('all');
  const [attachment, setAttachment] = useState<any>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChat, setNewChat] = useState({ type: 'Direct', title: '', emails: '' });
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [shareMessage, setShareMessage] = useState<ChatMessage | null>(null);
  const [shareRecipients, setShareRecipients] = useState('');

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await conversationAPI.getConversations()).data as Conversation[],
  });

  const messages = useQuery({
    queryKey: ['conversation-messages', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => (await conversationAPI.getMessages(selected!.id)).data as ChatMessage[],
  });

  const scheduledMessages = useQuery({
    queryKey: ['scheduled-messages', selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => (await conversationAPI.getScheduledMessages(selected!.id)).data,
  });

  useEffect(() => {
    if (!session?.token || !user?.id) return;
    initializeSignalR(session.token);
    startSignalR().then(() => realtime.joinUser(user.id)).catch(() => undefined);
    return onSignalR('ConversationMessage', () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selected?.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [session?.token, user?.id, selected?.id]);

  useEffect(() => {
    flushOutbox().then((sent) => {
      if (sent) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    }).catch(() => undefined);
  }, []);

  const send = useMutation({
    mutationFn: async () => {
      if (!selected?.id) throw new Error('Select a chat first.');
      let attachmentData: any = null;
      if (attachment?.uri) {
        const data = new FormData();
        data.append('file', {
          uri: attachment.uri,
          name: attachment.name || 'attachment',
          type: attachment.mimeType || 'application/octet-stream',
        } as any);
        attachmentData = (await conversationAPI.uploadAttachment(selected.id, data)).data;
      }

      const payload = {
        message,
        isImportant: message.startsWith('!'),
        attachmentFileName: attachmentData?.fileName,
        attachmentUrl: attachmentData?.url,
        attachmentContentType: attachmentData?.contentType,
        attachmentSizeBytes: attachmentData?.sizeBytes,
      };

      try {
        return await conversationAPI.sendMessage(selected.id, payload);
      } catch (error) {
        await enqueueMessage(selected.id, payload);
        throw error;
      }
    },
    onSuccess: () => {
      setMessage('');
      setAttachment(null);
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selected?.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: any) => Alert.alert('Message failed', error?.response?.data?.message || error.message),
  });

  const filteredMessages = useMemo(() => {
    const list = messages.data || [];
    return list.filter((item) => {
      if (filter === 'important') return item.isImportant;
      if (filter === 'pinned') return item.isPinned;
      if (filter === 'files') return item.attachmentUrl;
      if (filter === 'unread') return false;
      return true;
    });
  }, [filter, messages.data]);

  const startCall = async (callType: 'audio' | 'video') => {
    if (!selected) return;
    const meeting = (await meetingAPI.createMeeting({ title: `${selected.title || selected.name || 'Chat'} call`, durationMinutes: 60, startTime: new Date().toISOString(), chatEnabled: true })).data;
    const recipients = selected.participants?.filter((participant) => participant.id !== user?.id).map((participant) => participant.id) || [];
    await realtime.sendIncomingCall(selected.id, meeting.id, user!.id, user?.displayName || user?.email || 'Samvaad user', callType, meeting.meetingLink || '', recipients);
    Alert.alert('Calling', 'Samvaad is ringing available users now.');
  };

  const createChat = async () => {
    const response = await conversationAPI.createConversation({
      type: newChat.type,
      title: newChat.title || undefined,
      participantEmails: newChat.emails.split(',').map((item) => item.trim()).filter(Boolean),
    });
    setSelected(response.data);
    setShowNewChat(false);
    setNewChat({ type: 'Direct', title: '', emails: '' });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const saveEditedMessage = async () => {
    if (!selected || !editingMessage) return;
    await conversationAPI.updateMessage(selected.id, editingMessage.id, {
      message,
      isImportant: message.startsWith('!') || editingMessage.isImportant,
    });
    setEditingMessage(null);
    setMessage('');
    queryClient.invalidateQueries({ queryKey: ['conversation-messages', selected.id] });
  };

  const shareDocument = async () => {
    if (!selected || !shareMessage) return;
    await conversationAPI.shareDocument(selected.id, shareMessage.id, {
      recipients: shareRecipients.split(',').map((item) => item.trim()).filter(Boolean),
      message: 'Shared from Samvaad mobile.',
    });
    setShareMessage(null);
    setShareRecipients('');
    Alert.alert('Shared', 'Document share email was requested.');
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (!result.canceled) setAttachment(result.assets[0]);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) setAttachment(result.assets[0]);
  };

  return (
    <Screen>
      <AppHeader title="Talk" />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 140, borderRightWidth: 1, borderRightColor: '#0001' }}>
          <Field placeholder="Search" value={search} onChangeText={setSearch} style={{ margin: spacing.sm }} />
          <Button label="New" variant="secondary" onPress={() => setShowNewChat(true)} />
          {conversations.isLoading ? <LoadingState /> : null}
          <FlatList
            data={(conversations.data || []).filter((item) => (item.title || item.name || '').toLowerCase().includes(search.toLowerCase()))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelected(item)}>
                <Card style={{ margin: spacing.sm, gap: spacing.xs }}>
                  <AppText style={{ fontWeight: '800' }} numberOfLines={1}>{item.title || item.name || 'Chat'}</AppText>
                  <AppText small muted numberOfLines={1}>{item.lastMessage || 'No messages yet'}</AppText>
                  {item.unreadCount ? <Badge label={`${item.unreadCount}`} tone="danger" /> : null}
                </Card>
              </Pressable>
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          {selected ? (
            <>
              <View style={{ padding: spacing.sm, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <Avatar name={selected.title || selected.name} />
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontWeight: '800' }}>{selected.title || selected.name || 'Chat'}</AppText>
                  <AppText small muted>{selected.type || 'conversation'}</AppText>
                </View>
                <Button label="📹" variant="secondary" onPress={() => startCall('video')} />
                <Button label="📞" variant="secondary" onPress={() => startCall('audio')} />
              </View>
              <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.sm }}>
                {['all', 'important', 'pinned', 'tasks', 'files', 'unread'].map((item) => (
                  <Pressable key={item} onPress={() => setFilter(item as any)}>
                    <Badge label={item} tone={filter === item ? 'success' : 'info'} />
                  </Pressable>
                ))}
              </ScrollView>
              <FlatList
                data={filteredMessages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                renderItem={({ item }) => (
                  <Card style={{ gap: spacing.xs }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText small muted>{item.senderName || 'User'}</AppText>
                      {item.isImportant ? <Badge label="Important" tone="warning" /> : null}
                    </View>
                    <AppText>{item.message || item.content}</AppText>
                    {item.attachmentFileName ? <Badge label={`📎 ${item.attachmentFileName}`} /> : null}
                    <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                      {['👍', '❤️', '😂', '😮'].map((emoji) => <Button key={emoji} label={emoji} variant="ghost" onPress={() => conversationAPI.toggleReaction(selected.id, item.id, { emoji })} />)}
                      <Button label={item.isPinned ? 'Unpin' : 'Pin'} variant="ghost" onPress={() => conversationAPI.togglePin(selected.id, item.id).then(() => queryClient.invalidateQueries({ queryKey: ['conversation-messages', selected.id] }))} />
                      <Button label="Task" variant="ghost" onPress={() => conversationAPI.createTask(selected.id, { title: item.message || item.content || 'Task', sourceMessageId: item.id })} />
                      <Button label="Edit" variant="ghost" onPress={() => { setEditingMessage(item); setMessage(item.message || item.content || ''); }} />
                      <Button label="Unread" variant="ghost" onPress={() => conversationAPI.markMessageUnread(selected.id, item.id)} />
                      {item.attachmentUrl ? <Button label="Share" variant="ghost" onPress={() => setShareMessage(item)} /> : null}
                    </View>
                  </Card>
                )}
              />
              {(scheduledMessages.data || []).length ? (
                <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm, padding: spacing.sm }}>
                  {(scheduledMessages.data || []).map((item: any) => (
                    <Badge key={item.id} label={`Scheduled ${new Date(item.scheduledFor || item.sendAt).toLocaleTimeString()}`} tone="warning" />
                  ))}
                </ScrollView>
              ) : null}
              {attachment ? <Badge label={`Ready: ${attachment.name || 'image'}`} /> : null}
              <View style={{ padding: spacing.sm, gap: spacing.sm }}>
                <Field placeholder="Type a message. Start with ! for important." multiline value={message} onChangeText={setMessage} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Attach" variant="secondary" onPress={pickFile} />
                  <Button label="Image" variant="secondary" onPress={pickImage} />
                  <Button label="Schedule" variant="secondary" onPress={() => selected && conversationAPI.scheduleMessage(selected.id, { message, scheduledFor: new Date(Date.now() + 5 * 60_000).toISOString() })} />
                  <Button label={editingMessage ? 'Save' : 'Send'} disabled={!message && !attachment} onPress={() => editingMessage ? saveEditedMessage() : send.mutate()} />
                  {editingMessage ? <Button label="Cancel" variant="ghost" onPress={() => { setEditingMessage(null); setMessage(''); }} /> : null}
                </View>
              </View>
            </>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', padding: spacing.lg }}>
              <EmptyState title="Select a chat" message="Direct, group, file, task, pin, reaction, and scheduled messages are supported." />
            </View>
          )}
        </View>
      </View>
      <Modal visible={showNewChat} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <AppText title>Start chat</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {['Direct', 'Group'].map((type) => <Button key={type} label={type} variant={newChat.type === type ? 'primary' : 'secondary'} onPress={() => setNewChat({ ...newChat, type })} />)}
            </View>
            {newChat.type === 'Group' ? <Field label="Group name" value={newChat.title} onChangeText={(title) => setNewChat({ ...newChat, title })} /> : null}
            <Field label="People" placeholder="name@example.com, teammate@example.com" value={newChat.emails} onChangeText={(emails) => setNewChat({ ...newChat, emails })} />
            <Button label="Create" disabled={!newChat.emails.trim()} onPress={createChat} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowNewChat(false)} />
          </Card>
        </View>
      </Modal>
      <Modal visible={Boolean(shareMessage)} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <AppText title>Share document</AppText>
            <Field label="Recipients" value={shareRecipients} onChangeText={setShareRecipients} placeholder="name@example.com" />
            <Button label="Send email" disabled={!shareRecipients.trim()} onPress={shareDocument} />
            <Button label="Cancel" variant="ghost" onPress={() => setShareMessage(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
