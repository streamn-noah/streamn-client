import { colors, radius, shadows, spacing, typography } from "@/constants/theme";
import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ visible, onClose, children }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Tap-to-dismiss layer */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    maxHeight: '82%',
    marginHorizontal: 14,
    marginBottom: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
