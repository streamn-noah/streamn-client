import { forwardRef, useState } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type TextFieldProps = TextInputProps & {
  label?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  error?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, style, iconLeft, iconRight, error, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = useState(false);

    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={[styles.inputWrapper, focused && styles.inputFocused, !!error && styles.inputError]}>
          {iconLeft ? <View style={styles.iconLeft}>{iconLeft}</View> : null}
          <TextInput
            placeholderTextColor={colors.textTertiary}
            ref={ref}
            style={[styles.input, style]}
            onFocus={(e) => { setFocused(true); onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); onBlur?.(e); }}
            {...props}
          />
          {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }
);

TextField.displayName = "TextField";

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    borderRadius: radius.full,
    borderWidth: 0,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  inputFocused: {
    backgroundColor: colors.surface,
  },
  inputError: {
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
  },
  iconLeft: {
    paddingLeft: spacing.xl,
  },
  iconRight: {
    paddingRight: spacing.xl,
  },
});
