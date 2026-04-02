import { create } from 'zustand';

import { loadGuardState, saveGuardState } from '../lib/guardStorage';
import type { AppUserProfile } from '../types/app';
import type {
  GuardAttendanceEntry,
  GuardChecklistItem,
  GuardEmergencyContact,
  GuardFrequentVisitorTemplate,
  GuardLocationSnapshot,
  GuardOfflineQueueItem,
  GuardPersistedState,
  GuardSosEvent,
  GuardSosType,
  GuardVisitorEntry,
} from '../types/guard';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultChecklistItems(): GuardChecklistItem[] {
  return [
    {
      id: 'perimeter-check',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Perimeter and gate lock check',
      description: 'Verify that the main gate, side gate, and boom barrier are secure.',
      requiredEvidence: false,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
    {
      id: 'fire-panel',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Fire panel and extinguisher inspection',
      description: 'Confirm the panel is normal and capture evidence for the red zone board.',
      requiredEvidence: true,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
    {
      id: 'cctv-wall',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'CCTV wall live feed review',
      description: 'Check all camera tiles and flag any blind spots before the first patrol.',
      requiredEvidence: false,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
    {
      id: 'visitor-desk',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Visitor desk readiness',
      description: 'Check register, intercom device, and visitor badges at the front desk.',
      requiredEvidence: false,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
    {
      id: 'equipment-room',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Pump room and DG room patrol',
      description: 'Walk the service rooms and capture any leak, smoke, or noise issue immediately.',
      requiredEvidence: true,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
    {
      id: 'handover-log',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Shift handover log updated',
      description: 'Record the previous shift notes before switching into active duty mode.',
      requiredEvidence: false,
      inputType: 'yes_no',
      numericValue: '',
      numericUnitLabel: null,
      numericMinValue: null,
      numericMaxValue: null,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
    },
  ];
}

function createDefaultFrequentVisitors(): GuardFrequentVisitorTemplate[] {
  return [
    {
      id: 'maid-anita',
      name: 'Anita Housekeeping',
      phone: '9876543210',
      purpose: 'Daily housekeeping',
      destination: 'Tower A - Flat 304',
      vehicleNumber: '',
    },
    {
      id: 'milk-ravi',
      name: 'Ravi Milk Delivery',
      phone: '9822113344',
      purpose: 'Morning milk delivery',
      destination: 'Tower B - Service bay',
      vehicleNumber: 'MH 12 AB 9081',
    },
    {
      id: 'driver-karim',
      name: 'Karim Driver',
      phone: '9811122233',
      purpose: 'Resident pickup',
      destination: 'Tower C - Flat 602',
      vehicleNumber: 'MH 14 CG 4412',
    },
  ];
}

function createDefaultEmergencyContacts(profile: AppUserProfile | null): GuardEmergencyContact[] {
  const locationName = profile?.assignedLocation?.locationName ?? 'Main gate';

  return [
    {
      id: 'supervisor',
      label: 'Security Supervisor',
      role: 'Shift escalation',
      phone: '9000000001',
      description: `Escalation owner for ${locationName} duty incidents.`,
      primary: true,
    },
    {
      id: 'manager',
      label: 'Society Manager',
      role: 'Operations',
      phone: '9000000002',
      description: 'Operations and society-level escalation support.',
      primary: false,
    },
    {
      id: 'control-room',
      label: 'Control Room',
      role: '24x7 support',
      phone: '9000000003',
      description: 'Central support line for immediate dispatch help.',
      primary: false,
    },
    {
      id: 'police',
      label: 'Police',
      role: 'Emergency',
      phone: '100',
      description: 'National police helpline.',
      primary: false,
    },
    {
      id: 'ambulance',
      label: 'Ambulance',
      role: 'Medical',
      phone: '102',
      description: 'Emergency medical support.',
      primary: false,
    },
    {
      id: 'fire',
      label: 'Fire Brigade',
      role: 'Fire safety',
      phone: '101',
      description: 'Fire emergency hotline.',
      primary: false,
    },
  ];
}

function createDefaultGuardState(profile: AppUserProfile | null): GuardPersistedState {
  return {
    ownerUserId: profile?.userId ?? null,
    isOfflineMode: false,
    dutyStatus: 'off_duty',
    lastPatrolResetAt: null,
    lastSyncAt: null,
    lastKnownLocation: null,
    attendanceLog: [],
    sosEvents: [],
    checklistItems: createDefaultChecklistItems(),
    checklistSubmittedAt: null,
    visitorLog: [],
    frequentVisitors: createDefaultFrequentVisitors(),
    emergencyContacts: createDefaultEmergencyContacts(profile),
    offlineQueue: [],
  };
}

function normalizeHydratedState(
  snapshot: GuardPersistedState | null,
  profile: AppUserProfile | null,
): GuardPersistedState {
  const fallback = createDefaultGuardState(profile);

  if (!snapshot || snapshot.ownerUserId !== profile?.userId) {
    return fallback;
  }

  return {
    ...fallback,
    ...snapshot,
    ownerUserId: profile?.userId ?? snapshot.ownerUserId,
    checklistItems: snapshot.checklistItems.length ? snapshot.checklistItems : fallback.checklistItems,
    frequentVisitors: snapshot.frequentVisitors.length
      ? snapshot.frequentVisitors
      : fallback.frequentVisitors,
    emergencyContacts: snapshot.emergencyContacts.length
      ? snapshot.emergencyContacts
      : fallback.emergencyContacts,
  };
}

interface GuardMutationOptions {
  label: string;
  queueType: GuardOfflineQueueItem['actionType'];
}

interface GuardStore extends GuardPersistedState {
  hasHydrated: boolean;
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  setOfflineMode: (value: boolean) => Promise<void>;
  rememberLocation: (location: GuardLocationSnapshot | null) => Promise<void>;
  resetPatrolClock: () => Promise<void>;
  clockIn: (options: {
    location: GuardLocationSnapshot | null;
    photoUri: string | null;
  }) => Promise<{ queued: boolean }>;
  clockOut: (options: {
    location: GuardLocationSnapshot | null;
    photoUri: string | null;
  }) => Promise<{ queued: boolean }>;
  triggerSos: (options: {
    alertType?: GuardSosType;
    note?: string;
    location: GuardLocationSnapshot | null;
    photoUri: string | null;
  }) => Promise<{ queued: boolean }>;
  toggleChecklistItem: (id: string) => Promise<void>;
  attachChecklistEvidence: (id: string, uri: string) => Promise<void>;
  submitChecklist: () => Promise<{ queued: boolean; submitted: boolean }>;
  addVisitor: (input: {
    name: string;
    phone: string;
    purpose: string;
    destination: string;
    vehicleNumber: string;
    photoUri: string | null;
    frequentVisitor: boolean;
  }) => Promise<{ queued: boolean }>;
  checkoutVisitor: (id: string) => Promise<{ queued: boolean; updated: boolean }>;
  flushOfflineQueue: () => Promise<number>;
}

function buildPersistedState(state: GuardStore): GuardPersistedState {
  return {
    ownerUserId: state.ownerUserId,
    isOfflineMode: state.isOfflineMode,
    dutyStatus: state.dutyStatus,
    lastPatrolResetAt: state.lastPatrolResetAt,
    lastSyncAt: state.lastSyncAt,
    lastKnownLocation: state.lastKnownLocation,
    attendanceLog: state.attendanceLog,
    sosEvents: state.sosEvents,
    checklistItems: state.checklistItems,
    checklistSubmittedAt: state.checklistSubmittedAt,
    visitorLog: state.visitorLog,
    frequentVisitors: state.frequentVisitors,
    emergencyContacts: state.emergencyContacts,
    offlineQueue: state.offlineQueue,
  };
}

async function persistGuardStore(get: () => GuardStore) {
  await saveGuardState(buildPersistedState(get()));
}

function withQueue(
  state: GuardStore,
  options: GuardMutationOptions,
): Pick<GuardPersistedState, 'lastSyncAt' | 'offlineQueue'> {
  if (state.isOfflineMode) {
    return {
      lastSyncAt: state.lastSyncAt,
      offlineQueue: [
        {
          id: createId(options.queueType),
          actionType: options.queueType,
          label: options.label,
          queuedAt: new Date().toISOString(),
        },
        ...state.offlineQueue,
      ],
    };
  }

  return {
    lastSyncAt: new Date().toISOString(),
    offlineQueue: state.offlineQueue,
  };
}

function reconcileQueuedState(
  state: GuardStore,
): Pick<GuardPersistedState, 'attendanceLog' | 'sosEvents' | 'offlineQueue' | 'lastSyncAt'> {
  return {
    attendanceLog: state.attendanceLog.map((entry) =>
      entry.queued
        ? {
            ...entry,
            queued: false,
          }
        : entry,
    ),
    sosEvents: state.sosEvents.map((event) =>
      event.status === 'queued'
        ? {
            ...event,
            status: 'sent',
          }
        : event,
    ),
    offlineQueue: [],
    lastSyncAt: new Date().toISOString(),
  };
}

export const useGuardStore = create<GuardStore>((set, get) => ({
  ...createDefaultGuardState(null),
  hasHydrated: false,

  bootstrap: async (profile) => {
    const storedState = await loadGuardState();
    const hydratedState = normalizeHydratedState(storedState, profile);

    set({
      ...hydratedState,
      hasHydrated: true,
    });

    await saveGuardState(hydratedState);
  },

  setOfflineMode: async (value) => {
    set({
      isOfflineMode: value,
    });

    await persistGuardStore(get);
  },

  rememberLocation: async (location) => {
    set({
      lastKnownLocation: location,
    });

    await persistGuardStore(get);
  },

  resetPatrolClock: async () => {
    set({
      lastPatrolResetAt: new Date().toISOString(),
    });

    await persistGuardStore(get);
  },

  clockIn: async (options) => {
    set((state) => {
      const queueState = withQueue(state, {
        label: 'Clock-in pending sync',
        queueType: 'attendance',
      });

      const entry: GuardAttendanceEntry = {
        id: createId('attendance'),
        action: 'clock_in',
        recordedAt: new Date().toISOString(),
        photoUri: options.photoUri,
        location: options.location,
        queued: state.isOfflineMode,
      };

      return {
        dutyStatus: 'on_duty',
        lastPatrolResetAt: entry.recordedAt,
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        attendanceLog: [entry, ...state.attendanceLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
    };
  },

  clockOut: async (options) => {
    set((state) => {
      const queueState = withQueue(state, {
        label: 'Clock-out pending sync',
        queueType: 'attendance',
      });

      const entry: GuardAttendanceEntry = {
        id: createId('attendance'),
        action: 'clock_out',
        recordedAt: new Date().toISOString(),
        photoUri: options.photoUri,
        location: options.location,
        queued: state.isOfflineMode,
      };

      return {
        dutyStatus: 'off_duty',
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        attendanceLog: [entry, ...state.attendanceLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
    };
  },

  triggerSos: async (options) => {
    set((state) => {
      const queueState = withQueue(state, {
        label:
          options.alertType === 'inactivity'
            ? 'Inactivity alert pending sync'
            : 'SOS alert pending sync',
        queueType: 'sos',
      });

      const nextEvent: GuardSosEvent = {
        id: createId('sos'),
        panicAlertId: null,
        alertType: options.alertType ?? 'panic',
        note: options.note ?? '',
        recordedAt: new Date().toISOString(),
        status: state.isOfflineMode ? 'queued' : 'sent',
        photoUri: options.photoUri,
        location: options.location,
        acknowledgedAt: null,
        resolvedAt: null,
        streamingActive: !state.isOfflineMode,
      };

      return {
        sosEvents: [nextEvent, ...state.sosEvents],
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
    };
  },

  toggleChecklistItem: async (id) => {
    set((state) => {
      if (state.checklistSubmittedAt) {
        return state;
      }

      return {
        checklistItems: state.checklistItems.map((item) => {
          if (item.id !== id) {
            return item;
          }

          const isCompleted = item.status === 'completed';

          return {
            ...item,
            status: isCompleted ? 'pending' : 'completed',
            completedAt: isCompleted ? null : new Date().toISOString(),
            responseValue: isCompleted ? null : 'yes',
          };
        }),
      };
    });

    await persistGuardStore(get);
  },

  attachChecklistEvidence: async (id, uri) => {
    set((state) => {
      if (state.checklistSubmittedAt) {
        return state;
      }

      return {
        checklistItems: state.checklistItems.map((item) =>
          item.id === id
            ? {
                ...item,
                evidenceUri: uri,
              }
            : item,
        ),
      };
    });

    await persistGuardStore(get);
  },

  submitChecklist: async () => {
    const state = get();
    const isReadyToSubmit =
      state.checklistItems.length > 0 &&
      state.checklistItems.every((item) => item.status === 'completed');

    if (!isReadyToSubmit || state.checklistSubmittedAt) {
      return {
        queued: false,
        submitted: false,
      };
    }

    set((currentState) => {
      const queueState = withQueue(currentState, {
        label: 'Checklist submission pending sync',
        queueType: 'checklist',
      });

      return {
        checklistSubmittedAt: new Date().toISOString(),
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
      submitted: true,
    };
  },

  addVisitor: async (input) => {
    set((state) => {
      const queueState = withQueue(state, {
        label: `Visitor entry pending sync: ${input.name}`,
        queueType: 'visitor',
      });

      const nextVisitor: GuardVisitorEntry = {
        id: createId('visitor'),
        backendId: null,
        name: input.name,
        phone: input.phone,
        purpose: input.purpose,
        destination: input.destination,
        flatId: null,
        residentId: null,
        vehicleNumber: input.vehicleNumber,
        photoUri: input.photoUri,
        photoUrl: null,
        recordedAt: new Date().toISOString(),
        status: 'inside',
        frequentVisitor: input.frequentVisitor,
        approvalStatus: 'pending',
        approvalDeadlineAt: null,
        decisionAt: null,
      };

      return {
        visitorLog: [nextVisitor, ...state.visitorLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
    };
  },

  checkoutVisitor: async (id) => {
    const visitor = get().visitorLog.find((entry) => entry.id === id);

    if (!visitor || visitor.status === 'checked_out') {
      return {
        queued: false,
        updated: false,
      };
    }

    set((state) => {
      const queueState = withQueue(state, {
        label: `Visitor checkout pending sync: ${visitor.name}`,
        queueType: 'visitor',
      });

      return {
        visitorLog: state.visitorLog.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: 'checked_out',
              }
            : entry,
        ),
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: get().isOfflineMode,
      updated: true,
    };
  },

  flushOfflineQueue: async () => {
    const queueSize = get().offlineQueue.length;

    if (!queueSize || get().isOfflineMode) {
      return 0;
    }

    set((state) => reconcileQueuedState(state));

    await persistGuardStore(get);
    return queueSize;
  },
}));
