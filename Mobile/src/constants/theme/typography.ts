import { colors } from "./colors";
import type { TextStyle } from "react-native";

export const fontFamilies = {
  display: "Newsreader_500Medium",
  body: "Satoshi-Regular",
  bodyMedium: "Satoshi-Medium",
  bodySemiBold: "Satoshi-Bold",
  bodyBold: "Satoshi-Bold",
  bodyHeavy: "Newsreader_700Bold",
} as const;

export const typography: Record<
  "displayLarge" | "headline" | "title" | "body" | "bodyBold" | "caption" | "button",
  TextStyle
> = {
  displayLarge: {
    fontFamily: fontFamilies.display,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  headline: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  title: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  bodyBold: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.7,
    color: colors.textSecondary,
  },
  button: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.7,
    color: colors.textPrimary,
  },
};
