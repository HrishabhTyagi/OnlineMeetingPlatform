import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useThemePreference } from '../context/ThemeContext';
import { SamvaadPalette, spacing } from '../theme/theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { palette } = useThemePreference();
  return <View style={[{ flex: 1, backgroundColor: palette.background }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { palette } = useThemePreference();
  return <View style={[styles(palette).card, style]}>{children}</View>;
}

export function AppText({ children, muted, title, small, style, numberOfLines }: { children: React.ReactNode; muted?: boolean; title?: boolean; small?: boolean; style?: any; numberOfLines?: number }) {
  const { palette } = useThemePreference();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? palette.muted : palette.text, fontSize: small ? 12 : title ? 22 : 15, fontWeight: title ? '700' : '400' }, style]}>
      {children}
    </Text>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled, icon }: { label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; icon?: string }) {
  const { palette } = useThemePreference();
  const s = styles(palette);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, variant === 'secondary' && s.secondaryButton, variant === 'danger' && s.dangerButton, variant === 'ghost' && s.ghostButton, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, variant !== 'primary' && variant !== 'danger' && { color: palette.text }]}>
        {icon ? `${icon} ` : ''}{label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ label, onPress, disabled, tone = 'default' }: { label: string; onPress?: () => void; disabled?: boolean; tone?: 'default' | 'danger' | 'success' | 'warning' }) {
  const { palette } = useThemePreference();
  const color = tone === 'danger' ? palette.danger : tone === 'success' ? palette.success : tone === 'warning' ? palette.warning : palette.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}20`,
        borderWidth: 1,
        borderColor: `${color}55`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color, fontWeight: '900' }}>{label.slice(0, 2).toUpperCase()}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const { palette } = useThemePreference();
  const s = styles(palette);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText small muted>{label}</AppText> : null}
      <TextInput
        placeholderTextColor={palette.muted}
        {...props}
        style={[s.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <Card style={{ alignItems: 'center', padding: spacing.xl }}>
      <AppText title>{title}</AppText>
      {message ? <AppText muted style={{ textAlign: 'center', marginTop: spacing.sm }}>{message}</AppText> : null}
    </Card>
  );
}

export function LoadingState() {
  const { palette } = useThemePreference();
  return (
    <View style={{ padding: spacing.xl }}>
      <ActivityIndicator color={palette.primary} />
    </View>
  );
}

export function Badge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'success' | 'danger' | 'warning' }) {
  const { palette } = useThemePreference();
  const color = tone === 'success' ? palette.success : tone === 'danger' ? palette.danger : tone === 'warning' ? palette.warning : palette.info;
  return (
    <View style={{ backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
      <AppText title style={{ fontSize: 18 }}>{title}</AppText>
      {action}
    </View>
  );
}

export function Avatar({ name, size = 40, status }: { name?: string; size?: number; status?: string }) {
  const { palette } = useThemePreference();
  const initials = (name || 'User').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const statusColor = status === 'Available' ? palette.success : status === 'Busy' || status === 'InMeeting' ? palette.danger : status === 'Presenting' ? palette.warning : palette.muted;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.elevated, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.text, fontWeight: '800' }}>{initials}</Text>
      </View>
      <View style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.28, height: size * 0.28, borderRadius: size, backgroundColor: statusColor, borderWidth: 2, borderColor: palette.surface }} />
    </View>
  );
}

function styles(palette: SamvaadPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: spacing.md,
    },
    button: {
      minHeight: 44,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    secondaryButton: {
      backgroundColor: palette.elevated,
      borderWidth: 1,
      borderColor: palette.border,
    },
    dangerButton: {
      backgroundColor: palette.danger,
    },
    ghostButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: palette.border,
    },
    buttonText: {
      color: palette.primaryText,
      fontWeight: '800',
    },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 12,
      backgroundColor: palette.surface,
      color: palette.text,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
  });
}
