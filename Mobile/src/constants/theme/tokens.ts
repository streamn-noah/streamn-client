import { colors } from "./colors";
import { radius } from "./radius";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { fontFamilies, typography } from "./typography";

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
  typography,
  fontFamilies,
} as const;

export type AppTheme = typeof theme;
