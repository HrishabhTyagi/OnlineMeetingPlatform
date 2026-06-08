import React, { useState } from 'react';
import { Alert, FlatList, Modal, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, EmptyState, Field, Screen } from '../components/Ui';
import { teamSpaceAPI } from '../services/api';
import { spacing } from '../theme/theme';
import { TeamSpace } from '../types/api';

export default function TeamsScreen() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: async () => (await teamSpaceAPI.getTeams()).data as TeamSpace[],
  });

  const createTeam = useMutation({
    mutationFn: () => teamSpaceAPI.createTeam({ name, description: 'Created from Samvaad mobile' }),
    onSuccess: () => {
      setName('');
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (error: any) => Alert.alert('Team failed', error?.response?.data?.message || error.message),
  });

  return (
    <Screen>
      <AppHeader title="Teams" />
      <View style={{ padding: spacing.md }}>
        <Button label="Create team" icon="+" onPress={() => setShowCreate(true)} />
      </View>
      <FlatList
        data={teams.data || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        ListEmptyComponent={<EmptyState title="No teams" message="Create team spaces for departments, projects, and channels." />}
        renderItem={({ item }) => (
          <Card style={{ gap: spacing.sm }}>
            <AppText title style={{ fontSize: 18 }}>{item.name}</AppText>
            <AppText muted>{item.description || 'Team space'}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(item.channels || []).map((channel) => <Badge key={channel.id} label={`# ${channel.name}`} />)}
            </View>
          </Card>
        )}
      />
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          <Card style={{ margin: spacing.md, gap: spacing.md }}>
            <AppText title>Create team</AppText>
            <Field label="Team name" value={name} onChangeText={setName} />
            <Button label="Create" disabled={!name || createTeam.isPending} onPress={() => createTeam.mutate()} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowCreate(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
