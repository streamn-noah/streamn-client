import '@/services/livekit-polyfill';
import '@/services/font-patch';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/components/providers/auth-provider';

import { initDownloadManager } from '@/services/download';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Aeonik': require('../../assets/fonts/AEONIK-MEDIUM.otf'),
    'Aeonik-Regular': require('../../assets/fonts/AEONIK-REGULAR.otf'),
    'Aeonik-Medium': require('../../assets/fonts/AEONIK-MEDIUM.otf'),
    'Aeonik-Bold': require('../../assets/fonts/AEONIK-BOLD.otf'),
    'Aeonik-Black': require('../../assets/fonts/AeonikBlack.otf'),
    'AEONIK-REGULAR': require('../../assets/fonts/AEONIK-REGULAR.otf'),
    'AEONIK-MEDIUM': require('../../assets/fonts/AEONIK-MEDIUM.otf'),
    'AEONIK-BOLD': require('../../assets/fonts/AEONIK-BOLD.otf'),
  });

  useEffect(() => {
    initDownloadManager();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);


  if (!loaded && !error) {
    return null;
  }

  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="main" options={{ headerShown: false }} />
        <Stack.Screen name="player" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="watchparty/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
      <StatusBar style="light" />
    </AuthProvider>
  );
}
