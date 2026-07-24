import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Check initial state
    NetInfo.fetch().then((state) => {
      setIsOffline(state.isConnected === false);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected can be null during connection transition, treat it as connected unless explicitly false
      setIsOffline(state.isConnected === false);
    });

    return () => unsubscribe();
  }, []);

  return { isOffline };
}
