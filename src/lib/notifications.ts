import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { isPreviewProfile } from './mobileBackend';
import { supabase } from './supabase';
import type { AppRole, AppUserProfile } from '../types/app';
import type {
  NotificationDeliveryMode,
  NotificationPermissionStatus,
  NotificationPlatform,
  NotificationPriority,
  NotificationRecord,
  NotificationRoute,
} from '../types/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationRouteDefinition {
  title: string;
  body: string;
  priority: NotificationPriority;
  dndBypass: boolean;
  deliveryModes: NotificationDeliveryMode[];
}

const ROUTE_DEFINITIONS: Record<NotificationRoute, NotificationRouteDefinition> = {
  sos_alert: {
    title: 'SOS / Panic Alert',
    body: 'A guard triggered a panic escalation with live location attached.',
    priority: 'critical',
    dndBypass: true,
    deliveryModes: ['push', 'sms'],
  },
  visitor_at_gate: {
    title: 'Visitor At Gate',
    body: 'Resident alert prepared for a new gate entry.',
    priority: 'high',
    dndBypass: false,
    deliveryModes: ['push', 'sms'],
  },
  inactivity_alert: {
    title: 'Inactivity Alert',
    body: 'A guard has been stationary beyond the configured patrol threshold.',
    priority: 'high',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  checklist_reminder: {
    title: 'Checklist Reminder',
    body: 'The daily guard checklist has not been started yet.',
    priority: 'medium',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  order_status_change: {
    title: 'Order Status Updated',
    body: 'A buyer order moved to the next workflow stage.',
    priority: 'medium',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  new_indent: {
    title: 'New Indent',
    body: 'A fresh indent has been forwarded to the supplier portal.',
    priority: 'high',
    dndBypass: false,
    deliveryModes: ['push', 'sms'],
  },
  material_delivery: {
    title: 'Material Delivery',
    body: 'A delivery vehicle entry requires manager-side material inspection.',
    priority: 'high',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  leave_decision: {
    title: 'Leave Decision',
    body: 'A leave application was approved or rejected.',
    priority: 'medium',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  payslip_ready: {
    title: 'Payslip Ready',
    body: 'A new payslip is available in the payroll vault.',
    priority: 'low',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  pest_control_alert: {
    title: 'Pest Control Alert',
    body: 'A resident-facing pest control advisory has been prepared.',
    priority: 'high',
    dndBypass: false,
    deliveryModes: ['push', 'sms'],
  },
  low_stock_alert: {
    title: 'Low Stock Alert',
    body: 'A tracked inventory item dropped below its reorder threshold.',
    priority: 'medium',
    dndBypass: false,
    deliveryModes: ['push'],
  },
  general_update: {
    title: 'Operational Update',
    body: 'A new update is available in your FacilityPro inbox.',
    priority: 'medium',
    dndBypass: false,
    deliveryModes: ['push'],
  },
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getNotificationDefinition(route: NotificationRoute) {
  return ROUTE_DEFINITIONS[route];
}

export function buildNotificationRecord(options: {
  id?: string;
  backendId?: string | null;
  backendType?: string | null;
  actionUrl?: string | null;
  route: NotificationRoute;
  title?: string;
  body?: string;
  priority?: NotificationPriority;
  createdAt?: string;
  readAt?: string | null;
  deliveryState?: NotificationRecord['deliveryState'];
  fallbackState?: NotificationRecord['fallbackState'];
  metadata?: Record<string, string | number | boolean | null>;
}): NotificationRecord {
  const definition = getNotificationDefinition(options.route);

  return {
    id: options.id ?? createId('notification'),
    backendId: options.backendId ?? null,
    backendType: options.backendType ?? null,
    actionUrl: options.actionUrl ?? null,
    route: options.route,
    title: options.title ?? definition.title,
    body: options.body ?? definition.body,
    priority: options.priority ?? definition.priority,
    createdAt: options.createdAt ?? new Date().toISOString(),
    readAt: options.readAt ?? null,
    dndBypass: definition.dndBypass,
    deliveryModes: definition.deliveryModes,
    deliveryState:
      options.deliveryState ??
      (definition.deliveryModes.includes('push') ? 'push_queued' : 'inbox_only'),
    fallbackState:
      options.fallbackState ??
      (definition.deliveryModes.includes('sms') && definition.deliveryModes.includes('push')
        ? 'armed'
        : 'not_applicable'),
    metadata: options.metadata ?? {},
  };
}

export function getRouteLabel(route: NotificationRoute) {
  return route.replace(/_/g, ' ');
}

export function createPreviewNotification(route: NotificationRoute, profile: AppUserProfile | null) {
  const firstName = profile?.fullName?.split(' ')[0] ?? 'Team';
  const locationName = profile?.assignedLocation?.locationName ?? 'Preview Tower';

  const templates: Record<NotificationRoute, { title: string; body: string }> = {
    sos_alert: {
      title: 'SOS / Panic Alert',
      body: `${firstName} received a guard-side SOS escalation from ${locationName}.`,
    },
    visitor_at_gate: {
      title: 'Visitor At Gate',
      body: `Resident advisory queued for a new visitor entry at ${locationName}.`,
    },
    inactivity_alert: {
      title: 'Inactivity Alert',
      body: `A guard patrol at ${locationName} crossed the inactivity threshold.`,
    },
    checklist_reminder: {
      title: 'Checklist Reminder',
      body: `The daily checklist for ${locationName} still needs to be started.`,
    },
    order_status_change: {
      title: 'Order Status Updated',
      body: `A buyer request from ${locationName} moved into the next fulfillment step.`,
    },
    new_indent: {
      title: 'New Indent',
      body: `A new indent for ${locationName} is waiting in the supplier portal.`,
    },
    material_delivery: {
      title: 'Material Delivery',
      body: `A guard logged a delivery vehicle and material inspection is now waiting.`,
    },
    leave_decision: {
      title: 'Leave Decision',
      body: `A leave request decision is ready for ${firstName}.`,
    },
    payslip_ready: {
      title: 'Payslip Ready',
      body: `The latest payroll cycle is now available in the payslip vault.`,
    },
    pest_control_alert: {
      title: 'Pest Control Alert',
      body: `Resident safety advisories for the ${locationName} pest-control slot are ready.`,
    },
    low_stock_alert: {
      title: 'Low Stock Alert',
      body: `A monitored inventory item at ${locationName} fell below the reorder threshold.`,
    },
    general_update: {
      title: 'Operational Update',
      body: `A fresh update for ${locationName} is now available in the inbox.`,
    },
  };

  const template = templates[route];
  return buildNotificationRecord({
    route,
    title: template.title,
    body: template.body,
    metadata: {
      locationName,
      role: profile?.role ?? 'unknown',
    },
  });
}

export async function configureNotificationChannels() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Promise.all([
    Notifications.setNotificationChannelAsync('critical', {
      name: 'Critical Alerts',
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      vibrationPattern: [0, 300, 200, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('high', {
      name: 'High Priority Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 180, 220],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('medium', {
      name: 'Operational Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 120, 120, 120],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }),
    Notifications.setNotificationChannelAsync('low', {
      name: 'Low Priority Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 80],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    }),
  ]);
}

function normalizePermissionStatus(status: Notifications.PermissionStatus): NotificationPermissionStatus {
  if (status === 'granted') {
    return 'granted';
  }

  if (status === 'denied') {
    return 'denied';
  }

  return 'undetermined';
}

export async function registerForDeviceNotifications() {
  await configureNotificationChannels();

  const current = await Notifications.getPermissionsAsync();
  const currentStatus = normalizePermissionStatus(current.status);

  let finalStatus = currentStatus;

  if (currentStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = normalizePermissionStatus(requested.status);
  }

  const platform: NotificationPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';

  if (finalStatus !== 'granted') {
    return {
      permissionStatus: finalStatus,
      token: null,
      platform,
    };
  }

  try {
    const deviceToken = await Notifications.getDevicePushTokenAsync();

    return {
      permissionStatus: finalStatus,
      token: typeof deviceToken.data === 'string' ? deviceToken.data : null,
      platform:
        deviceToken.type === 'ios'
          ? 'ios'
          : deviceToken.type === 'android'
            ? 'android'
            : platform,
    };
  } catch {
    return {
      permissionStatus: finalStatus,
      token: null,
      platform,
    };
  }
}

function normalizeBackendPriority(value: string | null | undefined): NotificationPriority {
  if (value === 'critical' || value === 'high' || value === 'low') {
    return value;
  }

  return 'medium';
}

function mapBackendTypeToRoute(value: string | null | undefined): NotificationRoute {
  switch (value) {
    case 'panic':
    case 'panic_acknowledged':
    case 'panic_resolved':
      return 'sos_alert';
    case 'visitor_at_gate':
      return 'visitor_at_gate';
    case 'inactivity':
    case 'geo_fence_breach':
      return 'inactivity_alert';
    case 'checklist_reminder':
      return 'checklist_reminder';
    case 'order_status_change':
      return 'order_status_change';
    case 'new_indent':
      return 'new_indent';
    case 'material_delivery':
      return 'material_delivery';
    case 'leave_decision':
      return 'leave_decision';
    case 'payslip_ready':
      return 'payslip_ready';
    case 'pest_control_alert':
      return 'pest_control_alert';
    case 'low_stock_alert':
      return 'low_stock_alert';
    default:
      return 'general_update';
  }
}

export interface BackendNotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  priority: string | null;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  created_at: string;
  delivery_state?: string | null;
  fallback_state?: string | null;
  data?: Record<string, string | number | boolean | null> | null;
}

export function mapBackendNotificationRecord(row: BackendNotificationRow): NotificationRecord {
  const route = mapBackendTypeToRoute(row.type);

  return buildNotificationRecord({
    id: row.id,
    backendId: row.id,
    backendType: row.type,
    actionUrl: row.action_url,
    route,
    title: row.title,
    body: row.body,
    priority: normalizeBackendPriority(row.priority),
    createdAt: row.created_at,
    readAt: row.is_read ? row.read_at ?? row.created_at : null,
    deliveryState:
      row.delivery_state === 'created' ||
      row.delivery_state === 'inbox_only' ||
      row.delivery_state === 'push_queued' ||
      row.delivery_state === 'delivered' ||
      row.delivery_state === 'failed'
        ? row.delivery_state
        : undefined,
    fallbackState:
      row.fallback_state === 'not_applicable' ||
      row.fallback_state === 'armed' ||
      row.fallback_state === 'queued' ||
      row.fallback_state === 'not_needed' ||
      row.fallback_state === 'sent' ||
      row.fallback_state === 'failed'
        ? row.fallback_state
        : undefined,
    metadata:
      typeof row.data === 'object' && row.data !== null
        ? row.data
        : {},
  });
}

export async function fetchRemoteNotifications(profile: AppUserProfile | null) {
  if (!profile?.userId || isPreviewProfile(profile)) {
    return [];
  }

  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, title, body, type, priority, is_read, read_at, action_url, created_at, delivery_state, fallback_state, data',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return ((data ?? []) as BackendNotificationRow[]).map(mapBackendNotificationRecord);
}

export async function markRemoteNotificationRead(backendId: string | null) {
  if (!backendId) {
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', backendId);

  if (error) {
    throw error;
  }
}

async function updateUserNotificationPreference(
  userId: string,
  role: AppRole | null,
  token: string,
  platform: NotificationPlatform,
) {
  const { data: userRow } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();

  const nextPreferences = {
    ...(typeof userRow?.preferences === 'object' && userRow.preferences !== null
      ? userRow.preferences
      : {}),
    mobileNotifications: {
      role,
      token,
      platform,
      updatedAt: new Date().toISOString(),
    },
  };

  await supabase
    .from('users')
    .update({
      preferences: nextPreferences,
    })
    .eq('id', userId);
}

export async function persistRemoteDeviceToken(
  profile: AppUserProfile | null,
  token: string,
  platform: NotificationPlatform,
) {
  if (!profile?.userId || !token || isPreviewProfile(profile)) {
    return false;
  }

  try {
    const { error } = await supabase.rpc('upsert_push_token', {
      p_device_type: platform,
      p_token: token,
      p_token_type: 'fcm',
    });

    if (error) {
      throw error;
    }

    return true;
  } catch {
    try {
      await updateUserNotificationPreference(profile.userId, profile.role, token, platform);
      return true;
    } catch {
      return false;
    }
  }
}

export async function schedulePreviewNotification(record: NotificationRecord) {
  const channelId =
    record.priority === 'critical'
      ? 'critical'
      : record.priority === 'high'
        ? 'high'
        : record.priority === 'medium'
          ? 'medium'
          : 'low';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: record.title,
      body: record.body,
      data: {
        route: record.route,
        recordId: record.id,
      },
      ...(Platform.OS === 'android' ? { channelId } : null),
    },
    trigger: null,
  });
}

const CHECKLIST_REMINDER_ID = 'guard-checklist-9am';

export async function scheduleChecklistReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(CHECKLIST_REMINDER_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: CHECKLIST_REMINDER_ID,
    content: {
      title: 'Checklist Reminder',
      body: 'Your daily guard checklist has not been started yet.',
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: 'medium' } : null),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  });
}

export async function cancelChecklistReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(CHECKLIST_REMINDER_ID).catch(() => {});
}
