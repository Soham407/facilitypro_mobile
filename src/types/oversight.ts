import type { AppRole } from './app';

export type OversightRole = Extract<AppRole, 'security_supervisor' | 'society_manager'>;

export type OversightGuardStatus = 'on_duty' | 'off_duty' | 'offline' | 'breach';
export type OversightAlertStatus = 'active' | 'acknowledged' | 'resolved';
export type OversightAlertType = 'panic' | 'inactivity' | 'geo_fence_breach';
export type OversightGeoStatus = 'verified' | 'outside_fence' | 'missing';
export type OversightAttendanceStatus = 'on_shift' | 'late' | 'completed' | 'absent';
export type OversightTicketType = 'behavior' | 'material' | 'return';
export type OversightMaterialIssueType = 'quality' | 'quantity';
export type OversightSeverity = 'low' | 'medium' | 'high' | 'critical';
export type OversightTicketStatus = 'open' | 'acknowledged' | 'closed';

export interface OversightGuardRecord {
  id: string;
  guardName: string;
  guardCode: string;
  assignedLocationName: string;
  status: OversightGuardStatus;
  lastSeenAt: string;
  checklistCompleted: number;
  checklistTotal: number;
  currentShiftLabel: string;
  latitude: number | null;
  longitude: number | null;
  visitorsHandledToday: number;
}

export interface OversightAlertRecord {
  id: string;
  guardId: string;
  guardName: string;
  locationName: string;
  alertType: OversightAlertType;
  status: OversightAlertStatus;
  createdAt: string;
  note: string;
}

export interface OversightVisitorGateStat {
  id: string;
  gateName: string;
  visitorsToday: number;
  visitorsThisWeek: number;
  pendingApprovals: number;
  deliveryVehicles: number;
}

export interface OversightAttendanceRecord {
  id: string;
  employeeName: string;
  roleLabel: string;
  locationName: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  geoStatus: OversightGeoStatus;
  status: OversightAttendanceStatus;
}

export interface OversightTicketRecord {
  id: string;
  ticketNumber: string | null;
  ticketType: OversightTicketType;
  materialIssueType: OversightMaterialIssueType | null;
  subjectName: string;
  category: string;
  severity: OversightSeverity;
  status: OversightTicketStatus;
  createdAt: string;
  note: string;
  evidenceUris: string[];
  batchNumber: string | null;
  orderedQuantity: number | null;
  receivedQuantity: number | null;
  shortageQuantity: number | null;
  returnQuantity: number | null;
  locationName: string | null;
  sourceVisitorId: string | null;
  parentTicketId: string | null;
  inspectionOutcome: 'approved' | 'rejected' | null;
}

export interface OversightMaterialDeliveryRecord {
  id: string;
  visitorName: string;
  purpose: string;
  vehicleNumber: string;
  photoUrl: string | null;
  gateName: string;
  entryTime: string;
}

export interface OversightPersistedState {
  ownerUserId: string | null;
  role: OversightRole;
  guards: OversightGuardRecord[];
  alerts: OversightAlertRecord[];
  visitorStats: OversightVisitorGateStat[];
  attendanceLog: OversightAttendanceRecord[];
  tickets: OversightTicketRecord[];
  refreshedAt: string | null;
}
