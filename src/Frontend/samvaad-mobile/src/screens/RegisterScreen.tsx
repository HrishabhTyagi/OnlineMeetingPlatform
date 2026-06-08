import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { spacing } from '../theme/theme';
import { AppText, Button, Card, Field, Screen } from '../components/Ui';
import { RootStackParamList } from './RootNavigator';

export default function RegisterScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Register'>) {
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await register(form.email.trim(), form.firstName.trim(), form.lastName.trim(), form.password);
    } catch (error: any) {
      Alert.alert('Registration failed', error?.response?.data?.message || error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, justifyContent: 'center', flexGrow: 1 }}>
        <Card style={{ gap: spacing.md }}>
          <AppText small muted>SAMVAAD</AppText>
          <AppText title>Create account</AppText>
          <Field label="First name" value={form.firstName} onChangeText={(firstName) => setForm({ ...form, firstName })} />
          <Field label="Last name" value={form.lastName} onChangeText={(lastName) => setForm({ ...form, lastName })} />
          <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} />
          <Field label="Password" secureTextEntry value={form.password} onChangeText={(password) => setForm({ ...form, password })} />
          <Button label={busy ? 'Creating...' : 'Create account'} disabled={busy} onPress={submit} />
          <Button label="Back to sign in" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
