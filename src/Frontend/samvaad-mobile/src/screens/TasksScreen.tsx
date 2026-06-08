import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, Field, Screen, SectionHeader } from '../components/Ui';
import { conversationAPI } from '../services/api';
import { spacing } from '../theme/theme';
import { Conversation, TaskItem } from '../types/api';

export default function TasksScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [filter, setFilter] = useState({ status: 'All', priority: 'All', query: '' });
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [form, setForm] = useState({ title: '', description: '', priority: 'Normal', dueDate: '', status: 'Pending', assigneeUserId: '' });

  const conversations = useQuery({
    queryKey: ['task-conversations'],
    queryFn: async () => (await conversationAPI.getConversations()).data as Conversation[],
  });

  const activeConversationId = selectedConversationId || conversations.data?.[0]?.id || '';

  const tasks = useQuery({
    queryKey: ['tasks', activeConversationId, filter],
    enabled: Boolean(activeConversationId),
    queryFn: async () => (await conversationAPI.getTasks(activeConversationId, {
      status: filter.status !== 'All' ? filter.status : undefined,
      priority: filter.priority !== 'All' ? filter.priority : undefined,
      query: filter.query || undefined,
    })).data as TaskItem[],
  });

  const visibleTasks = useMemo(() => tasks.data || [], [tasks.data]);

  const saveTask = useMutation({
    mutationFn: async () => {
      if (!activeConversationId) throw new Error('Open or create a chat before creating tasks.');
      if (editing?.id) {
        return conversationAPI.updateTask(activeConversationId, editing.id, form);
      }
      return conversationAPI.createTask(activeConversationId, form);
    },
    onSuccess: () => {
      setEditing(null);
      setForm({ title: '', description: '', priority: 'Normal', dueDate: '', status: 'Pending', assigneeUserId: '' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error: any) => Alert.alert('Task failed', error?.response?.data?.message || error.message),
  });

  const openEdit = (task: TaskItem) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'Normal',
      dueDate: task.dueDate || '',
      status: task.status || 'Pending',
      assigneeUserId: '',
    });
  };

  return (
    <Screen>
      <AppHeader title="Tasks" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Task filters" action={<Button label="New" onPress={() => setEditing({ id: '', title: '' })} />} />
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }}>
            {(conversations.data || []).map((conversation) => (
              <Pressable key={conversation.id} onPress={() => setSelectedConversationId(conversation.id)}>
                <Badge label={conversation.title || conversation.name || 'Chat'} tone={activeConversationId === conversation.id ? 'success' : 'info'} />
              </Pressable>
            ))}
          </ScrollView>
          <Field placeholder="Search tasks" value={filter.query} onChangeText={(query) => setFilter({ ...filter, query })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {['All', 'Pending', 'In Progress', 'Completed'].map((status) => (
              <Button key={status} label={status} variant={filter.status === status ? 'primary' : 'secondary'} onPress={() => setFilter({ ...filter, status })} />
            ))}
          </View>
        </Card>

        <FlatList
          data={visibleTasks}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState title="No tasks" message="Create tasks directly here or from a chat message." />}
          renderItem={({ item }) => (
            <Pressable onPress={() => openEdit(item)}>
              <Card style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <AppText style={{ flex: 1, fontWeight: '800' }}>{item.title}</AppText>
                  <Badge label={item.status || 'Pending'} tone={item.status === 'Completed' ? 'success' : 'warning'} />
                </View>
                <AppText muted>{item.description || 'No description'}</AppText>
                <AppText small muted>Owner: {item.ownerName || 'You'} {item.dueDate ? `· Due ${new Date(item.dueDate).toLocaleDateString()}` : ''}</AppText>
                {item.sourceMessageId ? <Badge label="Linked comment" /> : null}
              </Card>
            </Pressable>
          )}
        />
      </ScrollView>

      <Modal visible={Boolean(editing)} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <SectionHeader title={editing?.id ? 'Edit task' : 'Create task'} />
            <Field label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} />
            <Field label="Description" multiline value={form.description} onChangeText={(description) => setForm({ ...form, description })} />
            <Field label="Priority" value={form.priority} onChangeText={(priority) => setForm({ ...form, priority })} />
            <Field label="Due date" value={form.dueDate} onChangeText={(dueDate) => setForm({ ...form, dueDate })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {['Pending', 'In Progress', 'Completed'].map((status) => (
                <Button key={status} label={status} variant={form.status === status ? 'primary' : 'secondary'} onPress={() => setForm({ ...form, status })} />
              ))}
            </View>
            <Button label="Save task" disabled={!form.title} onPress={() => saveTask.mutate()} />
            {editing?.id ? <Button label="Delete task" variant="danger" onPress={() => conversationAPI.deleteTask(activeConversationId, editing.id).then(() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['tasks'] }); })} /> : null}
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
