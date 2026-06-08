import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import AppHeader from '../components/AppHeader';
import { AppText, Button, Card, Field, Screen } from '../components/Ui';
import { useAuth } from '../context/AuthContext';
import { licenseAPI } from '../services/api';
import { spacing } from '../theme/theme';

export default function LicenseScreen() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    planName: 'Business',
    billingCycle: 'Monthly',
    seatCount: '10',
    companyName: '',
    companySamvaadEmail: '',
    contactName: user?.displayName || '',
    contactEmail: user?.email || '',
    notes: '',
  });

  const submit = async () => {
    await licenseAPI.requestLicense({
      ...form,
      seatCount: Number(form.seatCount) || 1,
      estimatedAmount: (Number(form.seatCount) || 1) * 8,
      currency: 'USD',
    });
    Alert.alert('Request sent', 'Samvaad will email the product owner and your contact address.');
  };

  return (
    <Screen>
      <AppHeader title="License" />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Card style={{ gap: spacing.md }}>
          <AppText title>Purchase Samvaad license</AppText>
          <AppText muted>Payment is simulated. This sends a license request email for product-owner approval and organization setup.</AppText>
          <Field label="Company name" value={form.companyName} onChangeText={(companyName) => setForm({ ...form, companyName })} />
          <Field label="Company Samvaad email" placeholder="company@samvaad.com" value={form.companySamvaadEmail} onChangeText={(companySamvaadEmail) => setForm({ ...form, companySamvaadEmail })} />
          <Field label="Seats" keyboardType="numeric" value={form.seatCount} onChangeText={(seatCount) => setForm({ ...form, seatCount })} />
          <Field label="Contact name" value={form.contactName} onChangeText={(contactName) => setForm({ ...form, contactName })} />
          <Field label="Contact email" value={form.contactEmail} onChangeText={(contactEmail) => setForm({ ...form, contactEmail })} />
          <Field label="Notes" multiline value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} />
          <Button label="Send license request" onPress={submit} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
