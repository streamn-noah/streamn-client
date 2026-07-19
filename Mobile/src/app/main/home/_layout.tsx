import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="detail/[type]/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="top-10/[type]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="list" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
