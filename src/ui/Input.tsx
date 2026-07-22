import React, { useMemo, useState } from 'react';
import {
  KeyboardTypeOptions,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, spacing } from '../theme';
import type { Colors } from '../theme';
import { useColors } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  label,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  multiline,
  icon,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const colors = useColors();
  const styles = useMemo(() => crearEstilos(colors), [colors]);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText weight="semi" muted size={13} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.container,
          { borderColor: focused ? colors.brand : colors.line },
          multiline && styles.multilineContainer,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={focused ? colors.brand : colors.muted}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, multiline && styles.multilineInput]}
        />
      </View>
    </View>
  );
}

const crearEstilos = (colors: Colors) =>
  StyleSheet.create({
    wrapper: {
      marginBottom: spacing.md,
    },
    label: {
      marginBottom: spacing.xs,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      minHeight: 52,
    },
    multilineContainer: {
      minHeight: 100,
      alignItems: 'flex-start',
      paddingVertical: spacing.md,
    },
    icon: {
      marginRight: spacing.sm,
    },
    input: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 15,
      color: colors.ink,
      paddingVertical: spacing.md,
    },
    multilineInput: {
      textAlignVertical: 'top',
      paddingVertical: 0,
    },
  });
