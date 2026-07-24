import { Redirect } from 'expo-router';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function Index() {
  const { isOffline } = useNetworkStatus();
  return <Redirect href={isOffline ? "/main/downloads" : "/main/home"} />;
}

