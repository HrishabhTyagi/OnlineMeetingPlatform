import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Badge, Button, Card, Field, Screen, SectionHeader } from '../components/Ui';
import { useWorkspace } from '../context/WorkspaceContext';
import { organizationAPI } from '../services/api';
import { spacing } from '../theme/theme';

export default function OrganizationSettingsScreen({ navigation }: any) {
  const { workspace, organizations, useOrganization, refreshOrganizations } = useWorkspace();
  const [settings, setSettings] = useState<any>({});

  const current = useQuery({
    queryKey: ['mobile-current-org', workspace.organization?.id],
    enabled: workspace.kind === 'organization',
    queryFn: async () => (await organizationAPI.getCurrent()).data,
  });

  useEffect(() => {
    refreshOrganizations().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (current.data) {
      setSettings({
        name: current.data.name || '',
        primaryDomain: current.data.primaryDomain || '',
        storageProvider: current.data.storageProvider || current.data.storage?.provider || 'Local',
        retentionDays: String(current.data.retentionDays || current.data.storage?.retentionDays || 365),
        maxFileSizeMb: String(current.data.maxFileSizeMb || current.data.storage?.maxFileSizeMb || 100),
        recordingEnabledByDefault: Boolean(current.data.recordingEnabledByDefault),
        guestAccessEnabled: Boolean(current.data.guestAccessEnabled),
      });
    }
  }, [current.data?.id]);

  const save = async () => {
    await organizationAPI.updateCurrent({
      ...settings,
      retentionDays: Number(settings.retentionDays) || 365,
      maxFileSizeMb: Number(settings.maxFileSizeMb) || 100,
    });
    current.refetch();
    Alert.alert('Saved', 'Organization settings were updated.');
  };

  return (
    <Screen>
      <AppHeader title="Organization" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Switch organization" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {organizations.map((organization) => (
              <Button
                key={organization.id}
                label={organization.name}
                variant={workspace.organization?.id === organization.id ? 'primary' : 'secondary'}
                onPress={() => useOrganization(organization)}
              />
            ))}
          </View>
          {workspace.kind !== 'organization' ? <Badge label="Personal workspace active" tone="warning" /> : null}
        </Card>

        {workspace.kind === 'organization' ? (
          <Card style={{ gap: spacing.md }}>
            <SectionHeader title="SaaS controls" action={<Badge label={workspace.name} tone="success" />} />
            <Field label="Organization name" value={settings.name} onChangeText={(name) => setSettings({ ...settings, name })} />
            <Field label="Primary domain" value={settings.primaryDomain} onChangeText={(primaryDomain) => setSettings({ ...settings, primaryDomain })} />
            <Field label="Storage provider" value={settings.storageProvider} onChangeText={(storageProvider) => setSettings({ ...settings, storageProvider })} />
            <Field label="Retention days" keyboardType="numeric" value={settings.retentionDays} onChangeText={(retentionDays) => setSettings({ ...settings, retentionDays })} />
            <Field label="Max file size MB" keyboardType="numeric" value={settings.maxFileSizeMb} onChangeText={(maxFileSizeMb) => setSettings({ ...settings, maxFileSizeMb })} />
            <Button label="Save organization settings" onPress={save} />
            <Button label="Test storage" variant="secondary" onPress={() => organizationAPI.testStorage().then(() => Alert.alert('Storage test passed'))} />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
