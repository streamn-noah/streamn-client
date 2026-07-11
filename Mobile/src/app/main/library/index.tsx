import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@/constants/theme';

export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Library</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.headline,
    color: colors.textPrimary,
  },
});
