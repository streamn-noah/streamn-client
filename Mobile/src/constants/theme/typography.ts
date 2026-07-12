import { colors } from "./colors";
import type { TextStyle } from "react-native";

export const fontFamilies = {
  display: "System",
  body: "System",
  bodyMedium: "System",
  bodySemiBold: "System",
  bodyBold: "System",
  bodyHeavy: "System",
} as const;

export const typography: Record<
  "displayLarge" | "headline" | "title" | "body" | "bodyBold" | "caption" | "button",
  TextStyle
> = {
  displayLarge: {
    fontFamily: fontFamilies.display,
    fontWeight: '700',
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  headline: {
    fontFamily: fontFamilies.bodyBold,
    fontWeight: '700',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  title: {
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600',
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  bodyBold: {
    fontFamily: fontFamilies.bodyBold,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.7,
    color: colors.textSecondary,
  },
  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
};
