import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useThemePreference } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { spacing } from '../theme/theme';
import { AppText, Avatar, Badge } from './Ui';

export default function AppHeader({ title }: { title: string }) {
  const { user, updateStatus } = useAuth();
  const { workspace, organizations, refreshOrganizations, useOrganization, usePersonal } = useWorkspace();
  const { palette, themeName, setThemeName } = useThemePreference();

  useEffect(() => {
    refreshOrganizations().catch(() => undefined);
  }, []);

  return (
    <View style={{ padding: spacing.md, gap: spacing.sm, backgroundColor: palette.surface, borderBottomColor: palette.border, borderBottomWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <View>
          <AppText small muted>SAMVAAD</AppText>
          <AppText title>{title}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable onPress={() => setThemeName(themeName === 'classic' ? 'focus' : 'classic')}>
            <Badge label={themeName === 'classic' ? 'Classic' : 'Focus'} />
          </Pressable>
          <Avatar name={user?.displayName || `${user?.firstName || ''} ${user?.lastName || ''}`} status={user?.status} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Pressable onPress={usePersonal}>
          <Badge label="Personal" tone={workspace.kind === 'personal' ? 'success' : 'info'} />
        </Pressable>
        {organizations.slice(0, 3).map((org) => (
          <Pressable key={org.id} onPress={() => useOrganization(org)}>
            <Badge label={org.name} tone={workspace.organization?.id === org.id ? 'success' : 'info'} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {['Available', 'Busy', 'Away', 'Offline'].map((status) => (
          <Pressable key={status} onPress={() => updateStatus(status).catch(() => undefined)}>
            <Badge label={status} tone={user?.status === status ? 'success' : 'info'} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
