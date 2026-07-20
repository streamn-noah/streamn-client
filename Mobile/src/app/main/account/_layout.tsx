import { Stack } from 'expo-router';

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'card' }} />
      <Stack.Screen name="video-quality" options={{ presentation: 'card' }} />
      <Stack.Screen name="terms-legal" options={{ presentation: 'card' }} />
    </Stack>
  );
}
