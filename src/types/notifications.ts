import type { AppRole } from './app';

export type NotificationRoute =
  | 'sos_alert'
  | 'visitor_at_gate'
  | 'inactivity_alert'
  | 'checklist_reminder'
  | 'order_status_change'
  | 'new_indent'
  | 'material_delivery'
  | 'leave_decision'
  | 'payslip_ready'
  | 'pest_control_alert'
  | 'low_stock_alert'
  | 'general_update';

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';
export type NotificationDeliveryMode = 'push' | 'sms';
export type NotificationDeliveryState =
  | 'created'
  | 'inbox_only'
  | 'push_queued'
  | 'delivered'
  | 'failed';
export type NotificationFallbackState =
  | 'not_applicable'
  | 'armed'
  | 'queued'
  | 'not_needed'
  | 'sent'
  | 'failed';
export type NotificationPermissionStatus = 'undetermined' | 'denied' | 'granted';
export type NotificationPlatform = 'android' | 'ios' | 'unknown';

export interface NotificationRecord {
  id: string;
  backendId: string | null;
  backendType: string | null;
  actionUrl: string | null;
  route: NotificationRoute;
  title: string;
  body: string;
  priority: NotificationPriority;
  createdAt: string;
  readAt: string | null;
  dndBypass: boolean;
  deliveryModes: NotificationDeliveryMode[];
  deliveryState: NotificationDeliveryState;
  fallbackState: NotificationFallbackState;
  metadata: Record<string, string | number | boolean | null>;
}

export interface NotificationPersistedState {
  ownerUserId: string | null;
  ownerRole: AppRole | null;
  deviceToken: string | null;
  devicePlatform: NotificationPlatform;
  permissionStatus: NotificationPermissionStatus;
  lastRegisteredAt: string | null;
  lastOpenedAt: string | null;
  inbox: NotificationRecord[];
}
