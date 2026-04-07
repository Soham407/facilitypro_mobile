import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { calculateDistanceMeters } from './location';

interface PatrolMeta {
  dutyStatus: 'on_duty' | 'off_duty';
  lastMovementLat: number;
  lastMovementLng: number;
  lastMovementAt: string;
  warningSentAt: string | null;
}

const PATROL_META_KEY = '@guard_patrol_meta';
const PENDING_INACTIVITY_SOS_KEY = '@guard_pending_inactivity_sos';
const INACTIVITY_WARNING_MS = 25 * 60 * 1000;
const INACTIVITY_SOS_MS = 30 * 60 * 1000;
export const MOVEMENT_THRESHOLD_METERS = 10;

export const PATROL_LOCATION_TASK = 'guard-patrol-location-watch';

async function readPatrolMeta(): Promise<PatrolMeta | null> {
  const rawValue = await AsyncStorage.getItem(PATROL_META_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PatrolMeta;
  } catch {
    return null;
  }
}

async function savePatrolMeta(meta: PatrolMeta) {
  await AsyncStorage.setItem(PATROL_META_KEY, JSON.stringify(meta));
}

async function queuePendingInactivitySos(payload: {
  latitude: number;
  longitude: number;
}) {
  await AsyncStorage.setItem(PENDING_INACTIVITY_SOS_KEY, JSON.stringify(payload));
}

async function schedulePatrolNotification(options: {
  title: string;
  body: string;
  channelId: 'critical' | 'high';
}) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: options.title,
      body: options.body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: options.channelId } : null),
    },
    trigger: null,
  });
}

export function definePatrolTask() {
  if (TaskManager.isTaskDefined(PATROL_LOCATION_TASK)) {
    return;
  }

  TaskManager.defineTask(PATROL_LOCATION_TASK, async ({ data, error }) => {
    if (error || Platform.OS !== 'android') {
      return;
    }

    const meta = await readPatrolMeta();

    if (!meta || meta.dutyStatus !== 'on_duty') {
      return;
    }

    const locations =
      data && typeof data === 'object' && 'locations' in data
        ? ((data.locations as Location.LocationObject[] | undefined) ?? [])
        : [];
    const nextLocation = locations[0];

    if (!nextLocation) {
      return;
    }

    const latitude = nextLocation.coords.latitude;
    const longitude = nextLocation.coords.longitude;
    const now = new Date().toISOString();
    const distanceMoved = calculateDistanceMeters(
      meta.lastMovementLat,
      meta.lastMovementLng,
      latitude,
      longitude,
    );

    if (distanceMoved > MOVEMENT_THRESHOLD_METERS) {
      await savePatrolMeta({
        dutyStatus: 'on_duty',
        lastMovementLat: latitude,
        lastMovementLng: longitude,
        lastMovementAt: now,
        warningSentAt: null,
      });
      return;
    }

    const elapsed = Date.now() - new Date(meta.lastMovementAt).getTime();

    if (elapsed >= INACTIVITY_WARNING_MS && !meta.warningSentAt) {
      await schedulePatrolNotification({
        title: 'Inactivity warning',
        body: 'Tap the app to confirm you are active. SOS will be sent in 5 minutes.',
        channelId: 'high',
      });

      await savePatrolMeta({
        ...meta,
        warningSentAt: now,
      });
      return;
    }

    if (elapsed >= INACTIVITY_SOS_MS) {
      await schedulePatrolNotification({
        title: 'Inactivity SOS triggered automatically.',
        body: 'The app recorded a no-movement escalation and will send it when reopened.',
        channelId: 'critical',
      });

      await queuePendingInactivitySos({
        latitude,
        longitude,
      });

      await savePatrolMeta({
        ...meta,
        lastMovementAt: now,
        warningSentAt: null,
      });
    }
  });
}

export async function startPatrolTracking(lat: number, lng: number): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const now = new Date().toISOString();
  await savePatrolMeta({
    dutyStatus: 'on_duty',
    lastMovementLat: lat,
    lastMovementLng: lng,
    lastMovementAt: now,
    warningSentAt: null,
  });

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(PATROL_LOCATION_TASK).catch(
    () => false,
  );

  if (hasStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(PATROL_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 0,
    timeInterval: 60_000,
    foregroundService: {
      notificationTitle: 'FacilityPro patrol tracking',
      notificationBody: 'Patrol inactivity monitoring is active during your shift.',
      killServiceOnDestroy: false,
    },
  });
}

export async function resetPatrolTrackingWindow(location?: {
  latitude: number;
  longitude: number;
} | null): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const meta = await readPatrolMeta();

  if (!meta || meta.dutyStatus !== 'on_duty') {
    return;
  }

  await savePatrolMeta({
    ...meta,
    lastMovementLat: location?.latitude ?? meta.lastMovementLat,
    lastMovementLng: location?.longitude ?? meta.lastMovementLng,
    lastMovementAt: new Date().toISOString(),
    warningSentAt: null,
  });
}

export async function stopPatrolTracking(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(PATROL_LOCATION_TASK).catch(
      () => false,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(PATROL_LOCATION_TASK);
    }
  } catch {
    // Ignore stop failures and clear persisted patrol state anyway.
  }

  await AsyncStorage.removeItem(PATROL_META_KEY);
  await AsyncStorage.removeItem(PENDING_INACTIVITY_SOS_KEY);
}

export async function consumePendingInactivitySos(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const rawValue = await AsyncStorage.getItem(PENDING_INACTIVITY_SOS_KEY);

  if (!rawValue) {
    return null;
  }

  await AsyncStorage.removeItem(PENDING_INACTIVITY_SOS_KEY);

  try {
    const parsed = JSON.parse(rawValue) as {
      latitude?: number;
      longitude?: number;
    };

    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
      return null;
    }

    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  } catch {
    return null;
  }
}
