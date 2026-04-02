import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

import { loadNotificationState, saveNotificationState } from '../lib/notificationStorage';
import {
  buildNotificationRecord,
  createPreviewNotification,
  markRemoteNotificationRead,
  persistRemoteDeviceToken,
  registerForDeviceNotifications,
  schedulePreviewNotification,
} from '../lib/notifications';
import type { AppUserProfile } from '../types/app';
import type {
  NotificationPermissionStatus,
  NotificationPersistedState,
  NotificationPlatform,
  NotificationRecord,
  NotificationRoute,
} from '../types/notifications';

function createDefaultState(profile: AppUserProfile | null): NotificationPersistedState {
  return {
    ownerUserId: profile?.userId ?? null,
    ownerRole: profile?.role ?? null,
    deviceToken: null,
    devicePlatform: 'unknown',
    permissionStatus: 'undetermined',
    lastRegisteredAt: null,
    lastOpenedAt: null,
    inbox: [],
  };
}

function normalizeHydratedState(
  snapshot: NotificationPersistedState | null,
  profile: AppUserProfile | null,
): NotificationPersistedState {
  const fallback = createDefaultState(profile);

  if (
    !snapshot ||
    snapshot.ownerUserId !== profile?.userId ||
    snapshot.ownerRole !== (profile?.role ?? null)
  ) {
    return fallback;
  }

  return {
    ...fallback,
    ...snapshot,
    ownerUserId: profile?.userId ?? snapshot.ownerUserId,
    ownerRole: profile?.role ?? snapshot.ownerRole,
  };
}

function buildPersistedState(state: NotificationStore): NotificationPersistedState {
  return {
    ownerUserId: state.ownerUserId,
    ownerRole: state.ownerRole,
    deviceToken: state.deviceToken,
    devicePlatform: state.devicePlatform,
    permissionStatus: state.permissionStatus,
    lastRegisteredAt: state.lastRegisteredAt,
    lastOpenedAt: state.lastOpenedAt,
    inbox: state.inbox,
  };
}

async function persistNotificationStore(get: () => NotificationStore) {
  await saveNotificationState(buildPersistedState(get()));
}

function mergeInbox(
  existing: NotificationRecord[],
  incoming: NotificationRecord[],
) {
  const previewOnly = existing.filter((entry) => entry.backendId === null);
  const merged = new Map<string, NotificationRecord>();

  for (const entry of [...incoming, ...previewOnly]) {
    const key = entry.backendId ?? entry.id;
    merged.set(key, entry);
  }

  return [...merged.values()].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

interface NotificationStore extends NotificationPersistedState {
  hasHydrated: boolean;
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  registerDevice: (profile: AppUserProfile | null) => Promise<void>;
  syncRemoteInbox: (records: NotificationRecord[]) => Promise<void>;
  upsertRemoteRecord: (record: NotificationRecord) => Promise<void>;
  queuePreviewRoute: (route: NotificationRoute, profile: AppUserProfile | null) => Promise<void>;
  ingestDeliveredNotification: (notification: Notifications.Notification) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  ...createDefaultState(null),
  hasHydrated: false,

  bootstrap: async (profile) => {
    const storedState = await loadNotificationState();
    const hydratedState = normalizeHydratedState(storedState, profile);

    set({
      ...hydratedState,
      hasHydrated: true,
    });

    await saveNotificationState(hydratedState);
  },

  registerDevice: async (profile) => {
    const registration = await registerForDeviceNotifications();

    set({
      permissionStatus: registration.permissionStatus as NotificationPermissionStatus,
      deviceToken: registration.token,
      devicePlatform: registration.platform as NotificationPlatform,
      lastRegisteredAt: new Date().toISOString(),
    });

    await persistNotificationStore(get);

    if (profile && registration.token) {
      await persistRemoteDeviceToken(profile, registration.token, registration.platform);
    }
  },

  syncRemoteInbox: async (records) => {
    set((state) => ({
      inbox: mergeInbox(state.inbox, records),
    }));

    await persistNotificationStore(get);
  },

  upsertRemoteRecord: async (record) => {
    set((state) => ({
      inbox: mergeInbox(state.inbox, [record]),
    }));

    await persistNotificationStore(get);
  },

  queuePreviewRoute: async (route, profile) => {
    const record = createPreviewNotification(route, profile);
    const pushAllowed = get().permissionStatus === 'granted';
    const previewRecord =
      !pushAllowed && record.deliveryModes.includes('push')
        ? {
            ...record,
            deliveryState: 'inbox_only' as const,
            fallbackState:
              record.deliveryModes.includes('sms') && record.fallbackState === 'armed'
                ? ('queued' as const)
                : record.fallbackState,
          }
        : record;

    set((state) => ({
      inbox: [previewRecord, ...state.inbox],
    }));

    await persistNotificationStore(get);

    if (previewRecord.deliveryModes.includes('push') && pushAllowed) {
      try {
        await schedulePreviewNotification(previewRecord);
      } catch {
        set((state) => ({
          inbox: state.inbox.map((entry) =>
            entry.id === previewRecord.id
              ? {
                  ...entry,
                  deliveryState: 'inbox_only',
                  fallbackState: entry.fallbackState === 'armed' ? 'queued' : entry.fallbackState,
                }
              : entry,
          ),
        }));

        await persistNotificationStore(get);
      }
    }
  },

  ingestDeliveredNotification: async (notification) => {
    const route =
      typeof notification.request.content.data?.route === 'string'
        ? (notification.request.content.data.route as NotificationRoute)
        : null;
    const recordId =
      typeof notification.request.content.data?.recordId === 'string'
        ? notification.request.content.data.recordId
        : typeof notification.request.content.data?.notification_id === 'string'
          ? notification.request.content.data.notification_id
        : null;

    if (recordId) {
      set((state) => ({
        inbox: state.inbox.map((entry) =>
          entry.id === recordId || entry.backendId === recordId
            ? {
                ...entry,
                deliveryState: 'delivered',
                fallbackState: entry.fallbackState === 'armed' ? 'not_needed' : entry.fallbackState,
              }
            : entry,
        ),
      }));

      await persistNotificationStore(get);
      return;
    }

    if (!route) {
      return;
    }

    const record = buildNotificationRecord({
      route,
      backendId:
        typeof notification.request.content.data?.notification_id === 'string'
          ? notification.request.content.data.notification_id
          : null,
      backendType:
        typeof notification.request.content.data?.backendType === 'string'
          ? notification.request.content.data.backendType
          : null,
      actionUrl:
        typeof notification.request.content.data?.actionUrl === 'string'
          ? notification.request.content.data.actionUrl
          : null,
      title: notification.request.content.title ?? undefined,
      body: notification.request.content.body ?? undefined,
      metadata:
        typeof notification.request.content.data === 'object' &&
        notification.request.content.data !== null
          ? (notification.request.content.data as Record<string, string | number | boolean | null>)
          : {},
    });

    set((state) => ({
      inbox: [record, ...state.inbox],
    }));

    await persistNotificationStore(get);
  },

  markRead: async (id) => {
    const target = get().inbox.find((entry) => entry.id === id);

    set((state) => ({
      lastOpenedAt: new Date().toISOString(),
      inbox: state.inbox.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              readAt: entry.readAt ?? new Date().toISOString(),
              fallbackState: entry.fallbackState === 'armed' ? 'not_needed' : entry.fallbackState,
            }
          : entry,
      ),
    }));

    await persistNotificationStore(get);

    try {
      await markRemoteNotificationRead(target?.backendId ?? null);
    } catch {
      // Keep the local inbox responsive even if the backend read marker fails.
    }
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    const backendIds = get()
      .inbox.filter((entry) => entry.readAt === null && entry.backendId)
      .map((entry) => entry.backendId as string);

    set((state) => ({
      lastOpenedAt: now,
      inbox: state.inbox.map((entry) => ({
        ...entry,
        readAt: entry.readAt ?? now,
        fallbackState: entry.fallbackState === 'armed' ? 'not_needed' : entry.fallbackState,
      })),
    }));

    await persistNotificationStore(get);

    await Promise.all(
      backendIds.map(async (backendId) => {
        try {
          await markRemoteNotificationRead(backendId);
        } catch {
          // Best effort only.
        }
      }),
    );
  },
}));
