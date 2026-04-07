import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { calculateDistanceMeters } from './location';
import { flagHrmsGeoFenceBreach } from './mobileBackend';
import { loadLocalOnboardingState } from './storage';

interface HrmsWatchdogMeta {
  employeeId: string;
  status: 'active' | 'inactive';
  outsideSince: string | null; // ISO string
  lastWarningSentAt: string | null;
}

const HRMS_WATCHDOG_META_KEY = '@hrms_watchdog_meta';
const BREACH_THRESHOLD_MS = 15 * 60 * 1000;
const GEOFENCE_RADIUS_METERS = 50;

export const HRMS_LOCATION_TASK = 'hrms-geofence-watch';

async function readWatchdogMeta(): Promise<HrmsWatchdogMeta | null> {
  const rawValue = await AsyncStorage.getItem(HRMS_WATCHDOG_META_KEY);
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue) as HrmsWatchdogMeta;
  } catch {
    return null;
  }
}

async function saveWatchdogMeta(meta: HrmsWatchdogMeta) {
  await AsyncStorage.setItem(HRMS_WATCHDOG_META_KEY, JSON.stringify(meta));
}

async function notifyBreach(options: { title: string; body: string; channelId: 'high' | 'critical' }) {
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

export function defineHrmsTask() {
  if (TaskManager.isTaskDefined(HRMS_LOCATION_TASK)) {
    return;
  }

  TaskManager.defineTask(HRMS_LOCATION_TASK, async ({ data, error }) => {
    if (error || Platform.OS !== 'android') {
      return;
    }

    const meta = await readWatchdogMeta();
    if (!meta || meta.status !== 'active') {
      return;
    }

    const onboarding = await loadLocalOnboardingState();
    const anchor = onboarding.geoCalibration;
    if (!anchor) return;

    const locations = data && typeof data === 'object' && 'locations' in data
      ? ((data.locations as Location.LocationObject[] | undefined) ?? [])
      : [];
    const nextLocation = locations[0];
    if (!nextLocation) return;

    const distance = calculateDistanceMeters(
      anchor.latitude,
      anchor.longitude,
      nextLocation.coords.latitude,
      nextLocation.coords.longitude,
    );

    const now = new Date().toISOString();
    const isOutside = distance > GEOFENCE_RADIUS_METERS;

    if (!isOutside) {
      if (meta.outsideSince) {
        await saveWatchdogMeta({ ...meta, outsideSince: null, lastWarningSentAt: null });
      }
      return;
    }

    // Still outside
    const outsideSince = meta.outsideSince || now;
    const elapsed = Date.now() - new Date(outsideSince).getTime();

    if (elapsed >= BREACH_THRESHOLD_MS && !meta.lastWarningSentAt) {
      await notifyBreach({
        title: 'Work zone alert',
        body: 'You have been outside your registered work zone for 15 minutes. This incident has been logged.',
        channelId: 'high',
      });

      try {
        await flagHrmsGeoFenceBreach({
          employeeId: meta.employeeId,
          location: {
            latitude: nextLocation.coords.latitude,
            longitude: nextLocation.coords.longitude,
            capturedAt: now,
            distanceFromAssignedSite: distance,
            withinGeoFence: false,
          },
        });
      } catch {
        // Silent fail for background RPC
      }

      await saveWatchdogMeta({
        ...meta,
        outsideSince,
        lastWarningSentAt: now,
      });
    } else if (!meta.outsideSince) {
      await saveWatchdogMeta({
        ...meta,
        outsideSince,
      });
    }
  });
}

export async function startHrmsTracking(employeeId: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  await saveWatchdogMeta({
    employeeId,
    status: 'active',
    outsideSince: null,
    lastWarningSentAt: null,
  });

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(HRMS_LOCATION_TASK).catch(() => false);
  if (hasStarted) return;

  await Location.startLocationUpdatesAsync(HRMS_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 0,
    timeInterval: 60_000,
    foregroundService: {
      notificationTitle: 'FacilityPro work zone monitor',
      notificationBody: 'Location verification is active for your HRMS shift.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopHrmsTracking(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(HRMS_LOCATION_TASK).catch(() => false);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(HRMS_LOCATION_TASK);
    }
  } catch {
    // Ignore stop failures
  }

  await AsyncStorage.removeItem(HRMS_WATCHDOG_META_KEY);
}
