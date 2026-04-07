export interface NetworkStateSnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

type NetworkStateListener = (state: NetworkStateSnapshot) => void;
type Unsubscribe = () => void;

interface NetInfoModule {
  addEventListener: (listener: NetworkStateListener) => Unsubscribe;
  fetch: () => Promise<NetworkStateSnapshot>;
}

const unavailableNetworkState: NetworkStateSnapshot = {
  isConnected: false,
  isInternetReachable: false,
};

let hasWarnedAboutUnavailableNetInfo = false;

function warnAboutUnavailableNetInfo(error: unknown) {
  if (!__DEV__ || hasWarnedAboutUnavailableNetInfo) {
    return;
  }

  hasWarnedAboutUnavailableNetInfo = true;

  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[networkInfo] NetInfo is unavailable in this client, so the app is falling back to offline-safe sync mode. Rebuild the native app to restore live connectivity monitoring. ${message}`,
  );
}

// Load NetInfo lazily so a stale native client doesn't crash the entire app on startup.
function loadNetInfoModule(): NetInfoModule | null {
  try {
    const loadedModule = require('@react-native-community/netinfo') as {
      default?: Partial<NetInfoModule>;
    } & Partial<NetInfoModule>;
    const netInfo = loadedModule.default ?? loadedModule;

    if (
      typeof netInfo.addEventListener === 'function' &&
      typeof netInfo.fetch === 'function'
    ) {
      return netInfo as NetInfoModule;
    }
  } catch (error) {
    warnAboutUnavailableNetInfo(error);
    return null;
  }

  warnAboutUnavailableNetInfo(new Error('NetInfo module did not expose the expected API.'));
  return null;
}

const netInfoModule = loadNetInfoModule();

export function subscribeToNetworkState(listener: NetworkStateListener): Unsubscribe {
  if (!netInfoModule) {
    listener(unavailableNetworkState);
    return () => undefined;
  }

  return netInfoModule.addEventListener(listener);
}

export async function fetchNetworkState(): Promise<NetworkStateSnapshot> {
  if (!netInfoModule) {
    return unavailableNetworkState;
  }

  try {
    return await netInfoModule.fetch();
  } catch (error) {
    warnAboutUnavailableNetInfo(error);
    return unavailableNetworkState;
  }
}
