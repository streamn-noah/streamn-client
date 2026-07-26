import { colors, fontFamilies, radius, shadows, spacing, typography } from "@/constants/theme";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ActivityIndicator as Loader } from "react-native";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  iconOnly?: boolean;
  disabled?: boolean;
  loading?: boolean;
  outline?: boolean;
  customColors?: { bg?: string; text?: string };
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  md: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
  },
  lg: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
};

export const Button = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  iconOnly = false,
  disabled = false,
  loading = false,
  outline = false,
  customColors,
  accessibilityLabel,
  style,
  labelStyle,
}: ButtonProps) => {
  const contentColor = customColors?.text ?? getContentColor(variant, outline);
  const containerStyles = [
    styles.base,
    sizeStyles[size],
    getVariantStyle(variant, outline),
    customColors?.bg ? { backgroundColor: customColors.bg } : null,
    disabled && styles.disabled,
    style,
  ];
  const labelStyles = [
    styles.label,
    size === "lg" ? styles.labelLg : null,
    { color: contentColor },
    labelStyle,
  ];

  const content = (
    <View style={[styles.content, iconOnly && styles.iconOnlyContent]}>
      {loading ? (
        <Loader color={contentColor} size="small" />
      ) : (
        leftIcon
      )}
      {label ? <Text style={labelStyles}>{label}</Text> : null}
      {!loading ? rightIcon : null}
    </View>
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        containerStyles,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
};

const getVariantStyle = (variant: ButtonVariant, outline: boolean): ViewStyle => {
  if (outline) {
    switch (variant) {
      case "primary":
        return { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.white };
      case "secondary":
        return { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.surfaceMuted };
    }
  }
  switch (variant) {
    case "secondary":
      return { backgroundColor: colors.surfaceMuted };
    case "primary":
    default:
      return { backgroundColor: colors.white, ...shadows.sm };
  }
};

const getContentColor = (variant: ButtonVariant, outline: boolean): string => {
  if (outline) {
    switch (variant) {
      case "primary": return colors.white;
      case "secondary": return colors.textSecondary;
    }
  }
  switch (variant) {
    case "secondary":
      return colors.white;
    case "primary":
    default:
      return colors.black;
  }
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    position: "relative",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    position: "relative",
    zIndex: 1,
  },
  iconOnlyContent: {
    paddingHorizontal: spacing.md - 2,
  },
  label: {
    ...typography.button,
    textAlign: "center",
  },
  labelLg: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
    lineHeight: 24,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.48,
    shadowOpacity: 0,
    elevation: 0,
  },
});
