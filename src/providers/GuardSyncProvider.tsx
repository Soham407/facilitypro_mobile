import { useEffect, useRef } from 'react';

import { fetchNetworkState, subscribeToNetworkState } from '../lib/networkInfo';
import { useAppStore } from '../store/useAppStore';
import { useGuardStore } from '../store/useGuardStore';

function isOnlineState(value: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  return value.isConnected !== false && value.isInternetReachable !== false;
}

export function GuardSyncProvider() {
  const session = useAppStore((state) => state.session);
  const hasHydrated = useGuardStore((state) => state.hasHydrated);
  const isOfflineMode = useGuardStore((state) => state.isOfflineMode);
  const isNetworkOnline = useGuardStore((state) => state.isNetworkOnline);
  const offlineQueueLength = useGuardStore((state) => state.offlineQueue.length);
  const setNetworkOnline = useGuardStore((state) => state.setNetworkOnline);
  const flushOfflineQueue = useGuardStore((state) => state.flushOfflineQueue);
  const isFlushingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkState((state) => {
      setNetworkOnline(isOnlineState(state));
    });

    void fetchNetworkState().then((state) => {
      setNetworkOnline(isOnlineState(state));
    });

    return unsubscribe;
  }, [setNetworkOnline]);

  useEffect(() => {
    if (
      !hasHydrated ||
      !session ||
      isOfflineMode ||
      !isNetworkOnline ||
      offlineQueueLength === 0 ||
      isFlushingRef.current
    ) {
      return;
    }

    isFlushingRef.current = true;

    void flushOfflineQueue().finally(() => {
      isFlushingRef.current = false;
    });
  }, [flushOfflineQueue, hasHydrated, isNetworkOnline, isOfflineMode, offlineQueueLength, session]);

  return null;
}
