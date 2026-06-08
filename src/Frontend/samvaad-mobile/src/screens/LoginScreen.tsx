import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { spacing } from '../theme/theme';
import { AppText, Button, Card, Field, Screen } from '../components/Ui';
import { RootStackParamList } from './RootNavigator';

export default function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (error: any) {
      Alert.alert('Sign in failed', error?.response?.data?.message || error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ justifyContent: 'center', padding: spacing.lg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={{ gap: spacing.md }}>
          <AppText small muted>SAMVAAD</AppText>
          <AppText title>Sign in</AppText>
          <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
          <Button label={busy ? 'Signing in...' : 'Sign in'} disabled={busy || !email || !password} onPress={submit} />
          <Button label="Create an account" variant="ghost" onPress={() => navigation.navigate('Register')} />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}
