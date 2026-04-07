import { create } from 'zustand';

import { loadOversightState, saveOversightState } from '../lib/oversightStorage';
import type { AppUserProfile } from '../types/app';
import type {
  OversightAlertRecord,
  OversightAttendanceRecord,
  OversightMaterialIssueType,
  OversightPersistedState,
  OversightRole,
  OversightTicketRecord,
  OversightTicketType,
  OversightVisitorGateStat,
  OversightGuardRecord,
  OversightSeverity,
} from '../types/oversight';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getOversightRole(profile: AppUserProfile | null): OversightRole {
  return profile?.role === 'society_manager' ? 'society_manager' : 'security_supervisor';
}

function createDefaultGuards(locationName: string): OversightGuardRecord[] {
  return [
    {
      id: 'guard-a',
      guardName: 'Aman Verma',
      guardCode: 'GRD-041',
      assignedLocationName: `${locationName} - North Gate`,
      status: 'on_duty',
      lastSeenAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      checklistCompleted: 5,
      checklistTotal: 6,
      currentShiftLabel: '06:00 - 14:00',
      latitude: 19.0764,
      longitude: 72.8772,
      visitorsHandledToday: 18,
    },
    {
      id: 'guard-b',
      guardName: 'Ritu Nair',
      guardCode: 'GRD-057',
      assignedLocationName: `${locationName} - Service Gate`,
      status: 'breach',
      lastSeenAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      checklistCompleted: 3,
      checklistTotal: 6,
      currentShiftLabel: '06:00 - 14:00',
      latitude: 19.0758,
      longitude: 72.8785,
      visitorsHandledToday: 9,
    },
    {
      id: 'guard-c',
      guardName: 'Farhan Shaikh',
      guardCode: 'GRD-063',
      assignedLocationName: `${locationName} - Lobby`,
      status: 'on_duty',
      lastSeenAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
      checklistCompleted: 6,
      checklistTotal: 6,
      currentShiftLabel: '14:00 - 22:00',
      latitude: 19.0769,
      longitude: 72.878,
      visitorsHandledToday: 12,
    },
    {
      id: 'guard-d',
      guardName: 'Kiran Yadav',
      guardCode: 'GRD-071',
      assignedLocationName: `${locationName} - Basement Ramp`,
      status: 'offline',
      lastSeenAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      checklistCompleted: 2,
      checklistTotal: 6,
      currentShiftLabel: '14:00 - 22:00',
      latitude: 19.0755,
      longitude: 72.8769,
      visitorsHandledToday: 4,
    },
  ];
}

function createDefaultAlerts(locationName: string): OversightAlertRecord[] {
  return [
    {
      id: 'alert-1',
      guardId: 'guard-b',
      guardName: 'Ritu Nair',
      locationName: `${locationName} - Service Gate`,
      alertType: 'geo_fence_breach',
      status: 'active',
      createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      note: 'Guard stayed outside the allowed boundary for more than 10 minutes.',
    },
    {
      id: 'alert-2',
      guardId: 'guard-d',
      guardName: 'Kiran Yadav',
      locationName: `${locationName} - Basement Ramp`,
      alertType: 'inactivity',
      status: 'acknowledged',
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      note: 'No movement detected during the active shift window.',
    },
    {
      id: 'alert-3',
      guardId: 'guard-a',
      guardName: 'Aman Verma',
      locationName: `${locationName} - North Gate`,
      alertType: 'panic',
      status: 'resolved',
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      note: 'False alarm after visitor rush escalation.',
    },
  ];
}

function createDefaultVisitorStats(locationName: string): OversightVisitorGateStat[] {
  return [
    {
      id: 'gate-north',
      gateName: `${locationName} - North Gate`,
      visitorsToday: 38,
      visitorsThisWeek: 216,
      pendingApprovals: 2,
      deliveryVehicles: 6,
    },
    {
      id: 'gate-service',
      gateName: `${locationName} - Service Gate`,
      visitorsToday: 24,
      visitorsThisWeek: 142,
      pendingApprovals: 1,
      deliveryVehicles: 11,
    },
    {
      id: 'gate-lobby',
      gateName: `${locationName} - Lobby Desk`,
      visitorsToday: 17,
      visitorsThisWeek: 96,
      pendingApprovals: 0,
      deliveryVehicles: 3,
    },
  ];
}

function createDefaultAttendanceLog(locationName: string): OversightAttendanceRecord[] {
  return [
    {
      id: 'attendance-1',
      employeeName: 'Aman Verma',
      roleLabel: 'Security Guard',
      locationName: `${locationName} - North Gate`,
      checkInAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      checkOutAt: null,
      geoStatus: 'verified',
      status: 'on_shift',
    },
    {
      id: 'attendance-2',
      employeeName: 'Ritu Nair',
      roleLabel: 'Security Guard',
      locationName: `${locationName} - Service Gate`,
      checkInAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      checkOutAt: null,
      geoStatus: 'outside_fence',
      status: 'late',
    },
    {
      id: 'attendance-3',
      employeeName: 'Maintenance Team Alpha',
      roleLabel: 'Facility Staff',
      locationName: `${locationName} - Pump Room`,
      checkInAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      checkOutAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      geoStatus: 'verified',
      status: 'completed',
    },
    {
      id: 'attendance-4',
      employeeName: 'Lift Technician Standby',
      roleLabel: 'Service Vendor',
      locationName: `${locationName} - Lobby Desk`,
      checkInAt: null,
      checkOutAt: null,
      geoStatus: 'missing',
      status: 'absent',
    },
  ];
}

function createDefaultTickets(locationName: string): OversightTicketRecord[] {
  return [
    {
      id: 'ticket-1',
      ticketNumber: 'OVS-01001',
      ticketType: 'behavior',
      materialIssueType: null,
      subjectName: 'Ritu Nair',
      category: 'Uniform non-compliance',
      severity: 'medium',
      status: 'open',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      note: 'Guard was missing the high-visibility vest during the 08:00 gate check.',
      evidenceUris: [],
      batchNumber: null,
      orderedQuantity: null,
      receivedQuantity: null,
      shortageQuantity: null,
      returnQuantity: null,
      locationName: `${locationName} - Service Gate`,
      sourceVisitorId: null,
      parentTicketId: null,
      inspectionOutcome: null,
    },
    {
      id: 'ticket-2',
      ticketNumber: 'OVS-01002',
      ticketType: 'material',
      materialIssueType: 'quality',
      subjectName: 'Lobby sanitiser refill',
      category: 'Damaged seal',
      severity: 'high',
      status: 'acknowledged',
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      note: 'Incoming refill can arrived with a broken top seal and visible leakage.',
      evidenceUris: [],
      batchNumber: 'BATCH-AC-119',
      orderedQuantity: null,
      receivedQuantity: null,
      shortageQuantity: null,
      returnQuantity: null,
      locationName: `${locationName} - Lobby Store`,
      sourceVisitorId: null,
      parentTicketId: null,
      inspectionOutcome: null,
    },
  ];
}

function createDefaultState(profile: AppUserProfile | null): OversightPersistedState {
  const role = getOversightRole(profile);
  const locationName = profile?.assignedLocation?.locationName ?? 'Preview Tower';

  return {
    ownerUserId: profile?.userId ?? null,
    role,
    guards: createDefaultGuards(locationName),
    alerts: createDefaultAlerts(locationName),
    visitorStats: createDefaultVisitorStats(locationName),
    attendanceLog: createDefaultAttendanceLog(locationName),
    tickets: createDefaultTickets(locationName),
    refreshedAt: new Date().toISOString(),
  };
}

function normalizeHydratedState(
  snapshot: OversightPersistedState | null,
  profile: AppUserProfile | null,
): OversightPersistedState {
  const fallback = createDefaultState(profile);

  if (
    !snapshot ||
    snapshot.ownerUserId !== profile?.userId ||
    snapshot.role !== getOversightRole(profile)
  ) {
    return fallback;
  }

  return {
    ...fallback,
    ...snapshot,
    ownerUserId: profile?.userId ?? snapshot.ownerUserId,
    role: getOversightRole(profile),
  };
}

interface OversightStore extends OversightPersistedState {
  hasHydrated: boolean;
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  refreshFeed: () => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
  resolveAlert: (id: string) => Promise<void>;
  setTicketStatus: (
    id: string,
    status: OversightTicketRecord['status'],
  ) => Promise<void>;
  createTicket: (input: {
    ticketType: OversightTicketType;
    materialIssueType?: OversightMaterialIssueType | null;
    subjectName: string;
    category: string;
    severity: OversightSeverity;
    note: string;
    evidenceUris: string[];
    batchNumber?: string;
    orderedQuantity?: number | null;
    receivedQuantity?: number | null;
    returnQuantity?: number | null;
    locationName?: string | null;
    sourceVisitorId?: string | null;
    parentTicketId?: string | null;
    inspectionOutcome?: 'approved' | 'rejected' | null;
  }) => Promise<void>;
}

function buildPersistedState(state: OversightStore): OversightPersistedState {
  return {
    ownerUserId: state.ownerUserId,
    role: state.role,
    guards: state.guards,
    alerts: state.alerts,
    visitorStats: state.visitorStats,
    attendanceLog: state.attendanceLog,
    tickets: state.tickets,
    refreshedAt: state.refreshedAt,
  };
}

async function persistOversightStore(get: () => OversightStore) {
  await saveOversightState(buildPersistedState(get()));
}

function moveLocation(value: number | null, offset: number) {
  if (typeof value !== 'number') {
    return null;
  }

  return Math.round((value + offset) * 1000000) / 1000000;
}

function normalizeQuantity(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

export const useOversightStore = create<OversightStore>((set, get) => ({
  ...createDefaultState(null),
  hasHydrated: false,

  bootstrap: async (profile) => {
    const storedState = await loadOversightState();
    const hydratedState = normalizeHydratedState(storedState, profile);

    set({
      ...hydratedState,
      hasHydrated: true,
    });

    await saveOversightState(hydratedState);
  },

  refreshFeed: async () => {
    set((state) => ({
      refreshedAt: new Date().toISOString(),
      guards: state.guards.map((guard, index) => {
        const offset = guard.status === 'on_duty' ? (index % 2 === 0 ? 0.00018 : -0.00014) : 0;

        return {
          ...guard,
          latitude: moveLocation(guard.latitude, offset),
          longitude: moveLocation(guard.longitude, offset / 2),
          lastSeenAt:
            guard.status === 'offline'
              ? guard.lastSeenAt
              : new Date(Date.now() - (index + 1) * 60 * 1000).toISOString(),
        };
      }),
      visitorStats: state.visitorStats.map((gate, index) => ({
        ...gate,
        visitorsToday: gate.visitorsToday + (index === 0 ? 1 : 0),
        visitorsThisWeek: gate.visitorsThisWeek + (index === 0 ? 1 : 0),
      })),
    }));

    await persistOversightStore(get);
  },

  acknowledgeAlert: async (id) => {
    set((state) => ({
      alerts: state.alerts.map((alert) =>
        alert.id === id && alert.status === 'active'
          ? {
              ...alert,
              status: 'acknowledged',
            }
          : alert,
      ),
    }));

    await persistOversightStore(get);
  },

  resolveAlert: async (id) => {
    set((state) => ({
      alerts: state.alerts.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status: 'resolved',
            }
          : alert,
      ),
    }));

    await persistOversightStore(get);
  },

  setTicketStatus: async (id, status) => {
    set((state) => ({
      tickets: state.tickets.map((ticket) =>
        ticket.id === id
          ? {
              ...ticket,
              status,
            }
          : ticket,
      ),
    }));

    await persistOversightStore(get);
  },

  createTicket: async (input) => {
    const orderedQuantity = normalizeQuantity(input.orderedQuantity);
    const receivedQuantity = normalizeQuantity(input.receivedQuantity);
    const shortageQuantity =
      orderedQuantity !== null && receivedQuantity !== null
        ? Math.max(orderedQuantity - receivedQuantity, 0)
        : null;

    set((state) => ({
      tickets: [
        {
          id: createId('ticket'),
          ticketNumber: null,
          ticketType: input.ticketType,
          materialIssueType: input.materialIssueType ?? null,
          subjectName: input.subjectName,
          category: input.category,
          severity: input.severity,
          status: 'open',
          createdAt: new Date().toISOString(),
          note: input.note,
          evidenceUris: input.evidenceUris,
          batchNumber: input.batchNumber ?? null,
          orderedQuantity,
          receivedQuantity,
          shortageQuantity,
          returnQuantity: normalizeQuantity(input.returnQuantity),
          locationName: input.locationName ?? null,
          sourceVisitorId: input.sourceVisitorId ?? null,
          parentTicketId: input.parentTicketId ?? null,
          inspectionOutcome: input.inspectionOutcome ?? null,
        },
        ...state.tickets,
      ],
    }));

    await persistOversightStore(get);
  },
}));
