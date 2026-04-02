export type GuardDutyStatus = 'off_duty' | 'on_duty';

export type GuardQueueActionType = 'attendance' | 'checklist' | 'sos' | 'visitor';

export type GuardSosType = 'panic' | 'inactivity';
export type GuardChecklistInputType = 'yes_no' | 'numeric';
export type GuardVisitorApprovalStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'timed_out'
  | 'checked_out'
  | 'inside';

export interface GuardLocationSnapshot {
  latitude: number;
  longitude: number;
  capturedAt: string;
  distanceFromAssignedSite: number | null;
  withinGeoFence: boolean;
}

export interface GuardAttendanceEntry {
  id: string;
  action: 'clock_in' | 'clock_out';
  recordedAt: string;
  photoUri: string | null;
  location: GuardLocationSnapshot | null;
  queued: boolean;
}

export interface GuardSosEvent {
  id: string;
  panicAlertId: string | null;
  alertType: GuardSosType;
  note: string;
  recordedAt: string;
  status: 'queued' | 'sent';
  photoUri: string | null;
  location: GuardLocationSnapshot | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  streamingActive: boolean;
}

export interface GuardChecklistItem {
  id: string;
  masterItemId: string | null;
  checklistId: string | null;
  title: string;
  description: string;
  requiredEvidence: boolean;
  inputType: GuardChecklistInputType;
  numericValue: string;
  numericUnitLabel: string | null;
  numericMinValue: number | null;
  numericMaxValue: number | null;
  requiresSupervisorOverride: boolean;
  responseValue: string | null;
  status: 'pending' | 'completed';
  completedAt: string | null;
  evidenceUri: string | null;
}

export interface GuardVisitorEntry {
  id: string;
  backendId: string | null;
  name: string;
  phone: string;
  purpose: string;
  destination: string;
  flatId: string | null;
  residentId: string | null;
  vehicleNumber: string;
  photoUri: string | null;
  photoUrl: string | null;
  recordedAt: string;
  status: 'inside' | 'checked_out';
  frequentVisitor: boolean;
  approvalStatus: GuardVisitorApprovalStatus;
  approvalDeadlineAt: string | null;
  decisionAt: string | null;
}

export interface GuardFrequentVisitorTemplate {
  id: string;
  name: string;
  phone: string;
  purpose: string;
  destination: string;
  vehicleNumber: string;
}

export interface GuardEmergencyContact {
  id: string;
  label: string;
  role: string;
  phone: string;
  description: string;
  primary: boolean;
}

export interface GuardOfflineQueueItem {
  id: string;
  actionType: GuardQueueActionType;
  label: string;
  queuedAt: string;
  payload?: Record<string, unknown> | null;
}

export interface GuardPersistedState {
  ownerUserId: string | null;
  isOfflineMode: boolean;
  dutyStatus: GuardDutyStatus;
  lastPatrolResetAt: string | null;
  lastSyncAt: string | null;
  lastKnownLocation: GuardLocationSnapshot | null;
  attendanceLog: GuardAttendanceEntry[];
  sosEvents: GuardSosEvent[];
  checklistItems: GuardChecklistItem[];
  checklistSubmittedAt: string | null;
  visitorLog: GuardVisitorEntry[];
  frequentVisitors: GuardFrequentVisitorTemplate[];
  emergencyContacts: GuardEmergencyContact[];
  offlineQueue: GuardOfflineQueueItem[];
}
