import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import {
  fetchRemoteNotifications,
  mapBackendNotificationRecord,
  type BackendNotificationRow,
} from '../lib/notifications';
import { isPreviewProfile } from '../lib/mobileBackend';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useNotificationStore } from '../store/useNotificationStore';

export function NotificationProvider() {
  const profile = useAppStore((state) => state.profile);
  const session = useAppStore((state) => state.session);
  const bootstrap = useNotificationStore((state) => state.bootstrap);
  const registerDevice = useNotificationStore((state) => state.registerDevice);
  const syncRemoteInbox = useNotificationStore((state) => state.syncRemoteInbox);
  const upsertRemoteRecord = useNotificationStore((state) => state.upsertRemoteRecord);

  useEffect(() => {
    void bootstrap(profile);
  }, [bootstrap, profile]);

  useEffect(() => {
    if (!profile || !session) {
      return;
    }

    void registerDevice(profile);
  }, [profile, registerDevice, session]);

  useEffect(() => {
    if (!profile || !session || isPreviewProfile(profile)) {
      return;
    }

    let isActive = true;

    void fetchRemoteNotifications(profile)
      .then((records) => {
        if (isActive) {
          void syncRemoteInbox(records);
        }
      })
      .catch(() => {
        // Leave the local inbox intact if the remote refresh fails.
      });

    const channel = supabase
      .channel(`notifications:${profile.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `user_id=eq.${profile.userId}`,
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            void upsertRemoteRecord(
              mapBackendNotificationRecord(payload.new as BackendNotificationRow),
            );
          }
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [profile, session, syncRemoteInbox, upsertRemoteRecord]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void useNotificationStore.getState().ingestDeliveredNotification(notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const recordId =
        typeof response.notification.request.content.data?.recordId === 'string'
          ? response.notification.request.content.data.recordId
          : typeof response.notification.request.content.data?.notification_id === 'string'
            ? response.notification.request.content.data.notification_id
          : null;

      if (recordId) {
        void useNotificationStore.getState().ingestDeliveredNotification(response.notification);
        void useNotificationStore.getState().markRead(recordId);
      }
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return null;
}
