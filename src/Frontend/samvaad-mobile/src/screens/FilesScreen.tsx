import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, Field, Screen, SectionHeader } from '../components/Ui';
import { conversationAPI, openProtectedApiAsset } from '../services/api';
import { spacing } from '../theme/theme';
import { ChatMessage, Conversation } from '../types/api';

export default function FilesScreen({ navigation }: any) {
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [shareTarget, setShareTarget] = useState<ChatMessage | null>(null);
  const [shareForm, setShareForm] = useState({ recipients: '', message: '' });

  const conversations = useQuery({
    queryKey: ['file-conversations'],
    queryFn: async () => (await conversationAPI.getConversations()).data as Conversation[],
  });

  const activeConversationId = selectedConversationId || conversations.data?.[0]?.id || '';

  const messages = useQuery({
    queryKey: ['file-messages', activeConversationId],
    enabled: Boolean(activeConversationId),
    queryFn: async () => (await conversationAPI.getMessages(activeConversationId)).data as ChatMessage[],
  });

  const files = useMemo(() => (messages.data || []).filter((message) => message.attachmentUrl), [messages.data]);

  const shareByEmail = async () => {
    if (!shareTarget || !activeConversationId) {
      return;
    }

    await conversationAPI.shareDocument(activeConversationId, shareTarget.id, {
      recipients: shareForm.recipients.split(',').map((item) => item.trim()).filter(Boolean),
      message: shareForm.message,
    });
    setShareTarget(null);
    setShareForm({ recipients: '', message: '' });
    Alert.alert('Shared', 'Document share email was requested.');
  };

  return (
    <Screen>
      <AppHeader title="Files" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Shared documents" />
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
            {(conversations.data || []).map((conversation) => (
              <Pressable key={conversation.id} onPress={() => setSelectedConversationId(conversation.id)}>
                <Badge label={conversation.title || conversation.name || 'Chat'} tone={activeConversationId === conversation.id ? 'success' : 'info'} />
              </Pressable>
            ))}
          </ScrollView>
          <AppText muted>Open files inside Samvaad, preview documents, and share permitted documents by email.</AppText>
        </Card>

        <FlatList
          data={files}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState title="No shared files" message="Files, screenshots, and documents from chat will appear here." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AppText style={{ flex: 1, fontWeight: '800' }}>{item.attachmentFileName || 'Attachment'}</AppText>
                {item.isImportant ? <Badge label="Important" tone="warning" /> : null}
              </View>
              <AppText muted>{item.attachmentContentType || 'Document'} · Shared by {item.senderName || 'User'}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Button label="Preview" onPress={() => openProtectedApiAsset(item.attachmentUrl)} />
                <Button label="Share email" variant="secondary" onPress={() => setShareTarget(item)} />
              </View>
            </Card>
          )}
        />
      </ScrollView>

      <Modal visible={Boolean(shareTarget)} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <SectionHeader title="Share document" />
            <AppText muted>{shareTarget?.attachmentFileName}</AppText>
            <Field label="Recipients" placeholder="name@example.com, teammate@example.com" value={shareForm.recipients} onChangeText={(recipients) => setShareForm({ ...shareForm, recipients })} />
            <Field label="Message" multiline value={shareForm.message} onChangeText={(message) => setShareForm({ ...shareForm, message })} />
            <Button label="Send email" disabled={!shareForm.recipients.trim()} onPress={shareByEmail} />
            <Button label="Cancel" variant="ghost" onPress={() => setShareTarget(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
