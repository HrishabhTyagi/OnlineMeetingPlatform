import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppHeader from '../components/AppHeader';
import { AppText, Avatar, Badge, Button, Card, Field, Screen, SectionHeader } from '../components/Ui';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import { requestNotificationPermission } from '../services/notifications';
import { spacing } from '../theme/theme';

export default function ProfileScreen({ navigation }: any) {
  const { user, refreshProfile, updateStatus, logout } = useAuth();
  const [profile, setProfile] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phoneNumber: (user as any)?.phoneNumber || '',
  });
  const [mfaCode, setMfaCode] = useState('');
  const [password, setPassword] = useState('');

  const mfa = useQuery({
    queryKey: ['mfa-status'],
    queryFn: async () => (await userAPI.getMfaStatus()).data,
  });

  useEffect(() => {
    setProfile({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phoneNumber: (user as any)?.phoneNumber || '',
    });
  }, [user?.id]);

  const saveProfile = async () => {
    await userAPI.updateProfile(profile);
    await refreshProfile();
    Alert.alert('Saved', 'Your profile was updated.');
  };

  const uploadAvatar = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (picked.canceled) {
      return;
    }

    const asset = picked.assets[0];
    const data = new FormData();
    data.append('file', {
      uri: asset.uri,
      name: asset.fileName || 'avatar.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as any);
    await userAPI.uploadAvatar(data);
    await refreshProfile();
  };

  const enableMfa = async () => {
    if (!mfaCode.trim()) {
      const setup = await userAPI.setupMfa();
      Alert.alert('MFA setup', setup.data?.manualEntryKey || setup.data?.secret || 'Enter the code from your authenticator app.');
      return;
    }

    await userAPI.enableMfa(mfaCode.trim());
    setMfaCode('');
    mfa.refetch();
  };

  const disableMfa = async () => {
    await userAPI.disableMfa(password, mfaCode || undefined);
    setPassword('');
    setMfaCode('');
    mfa.refetch();
  };

  return (
    <Screen>
      <AppHeader title="Profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} />
        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Account" action={<Badge label={user?.status || 'Available'} tone="success" />} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={user?.displayName || user?.email} status={user?.status} size={64} />
            <View style={{ flex: 1 }}>
              <AppText style={{ fontWeight: '800' }}>{user?.displayName || user?.email}</AppText>
              <AppText muted>{user?.email}</AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {['Available', 'Busy', 'Away', 'Offline', 'DoNotDisturb'].map((status) => (
              <Button key={status} label={status} variant={user?.status === status ? 'primary' : 'secondary'} onPress={() => updateStatus(status)} />
            ))}
          </View>
          <Button label="Upload avatar" variant="secondary" onPress={uploadAvatar} />
          <Button label="Remove avatar" variant="ghost" onPress={() => userAPI.removeAvatar().then(refreshProfile)} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Profile details" />
          <Field label="First name" value={profile.firstName} onChangeText={(firstName) => setProfile({ ...profile, firstName })} />
          <Field label="Last name" value={profile.lastName} onChangeText={(lastName) => setProfile({ ...profile, lastName })} />
          <Field label="Phone" value={profile.phoneNumber} onChangeText={(phoneNumber) => setProfile({ ...profile, phoneNumber })} />
          <Button label="Save profile" onPress={saveProfile} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Security" action={<Badge label={mfa.data?.enabled || mfa.data?.mfaEnabled ? 'MFA on' : 'MFA off'} tone={mfa.data?.enabled || mfa.data?.mfaEnabled ? 'success' : 'warning'} />} />
          <AppText muted>Use authenticator-based MFA and recovery codes for local testing without paid SMS or email OTP services.</AppText>
          <Field label="Authenticator code" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" />
          <Button label={mfaCode ? 'Enable MFA' : 'Start MFA setup'} onPress={enableMfa} />
          <Field label="Password to disable MFA" secureTextEntry value={password} onChangeText={setPassword} />
          <Button label="Disable MFA" variant="danger" disabled={!password} onPress={disableMfa} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <SectionHeader title="Notifications" />
          <Button label="Allow push notifications" variant="secondary" onPress={() => requestNotificationPermission().then((ok) => Alert.alert(ok ? 'Enabled' : 'Not enabled'))} />
        </Card>

        <Button label="Sign out" variant="danger" onPress={logout} />
      </ScrollView>
    </Screen>
  );
}
