import { create } from 'zustand';

import { loadGuardState, saveGuardState } from '../lib/guardStorage';
import { calculateDistanceMeters } from '../lib/location';
import {
  checkoutGuardVisitor,
  createGuardVisitorEntry,
  isPreviewProfile,
  startGuardPanicAlert,
  submitGuardChecklist,
} from '../lib/mobileBackend';
import {
  cancelChecklistReminder,
  scheduleChecklistReminder,
} from '../lib/notifications';
import {
  MOVEMENT_THRESHOLD_METERS,
  resetPatrolTrackingWindow,
  startPatrolTracking,
  stopPatrolTracking,
} from '../lib/patrolTask';
import type { AppUserProfile } from '../types/app';
import type {
  GuardAttendanceEntry,
  GuardAttendanceQueuePayload,
  GuardChecklistItem,
  GuardChecklistQueuePayload,
  GuardEmergencyContact,
  GuardFrequentVisitorTemplate,
  GuardLocationSnapshot,
  GuardOfflineQueueItem,
  GuardPersistedState,
  GuardSosQueuePayload,
  GuardSosEvent,
  GuardSosType,
  GuardVisitorCheckoutQueuePayload,
  GuardVisitorEntryQueuePayload,
  GuardVisitorEntry,
} from '../types/guard';
import { useAppStore } from './useAppStore';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultChecklistItems(): GuardChecklistItem[] {
  return [
    {
      id: 'water-pump-status',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Motor pump status',
      description: 'Verify if the water supply motor pump is currently running or stopped.',
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
      overrideStatus: 'none',
      overrideReason: null,
      overriddenAt: null,
      overriddenByName: null,
    },
    {
      id: 'water-tank-level',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Water tank level',
      description: 'Record the current water tank level as a percentage.',
      requiredEvidence: true,
      inputType: 'numeric',
      numericValue: '',
      numericUnitLabel: '%',
      numericMinValue: 0,
      numericMaxValue: 100,
      requiresSupervisorOverride: false,
      responseValue: null,
      status: 'pending',
      completedAt: null,
      evidenceUri: null,
      overrideStatus: 'none',
      overrideReason: null,
      overriddenAt: null,
      overriddenByName: null,
    },
    {
      id: 'parking-lights',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Parking lights logging',
      description: 'Log the time when parking lights are turned ON (evening) or OFF (morning).',
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
      overrideStatus: 'none',
      overrideReason: null,
      overriddenAt: null,
      overriddenByName: null,
    },
    {
      id: 'gate-shutter-check',
      masterItemId: null,
      checklistId: 'preview-checklist',
      title: 'Gate/Shutter check',
      description: 'Confirm that secondary gates and shutters are locked securely.',
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
      overrideStatus: 'none',
      overrideReason: null,
      overriddenAt: null,
      overriddenByName: null,
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
    lastMovementLocation: null,
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
    lastMovementLocation: snapshot.lastMovementLocation ?? fallback.lastMovementLocation,
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
  payload?: GuardOfflineQueueItem['payload'];
}

interface GuardStore extends GuardPersistedState {
  isNetworkOnline: boolean;
  hasHydrated: boolean;
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  setNetworkOnline: (value: boolean) => void;
  setOfflineMode: (value: boolean) => Promise<void>;
  rememberLocation: (location: GuardLocationSnapshot | null) => Promise<void>;
  resetPatrolClock: () => Promise<void>;
  updatePatrolLocation: (location: GuardLocationSnapshot) => Promise<void>;
  hydrateChecklistItems: (
    items: GuardChecklistItem[],
    submittedAt?: string | null,
  ) => Promise<void>;
  updateChecklistNumericValue: (id: string, value: string) => Promise<void>;
  hydrateVisitorLog: (entries: GuardVisitorEntry[]) => Promise<void>;
  hydrateEmergencyContacts: (contacts: GuardEmergencyContact[]) => Promise<void>;
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
  }) => Promise<{ queued: boolean; eventId: string }>;
  attachSosEvidence: (eventId: string, photoUri: string) => Promise<void>;
  stopSosStreaming: (eventId: string) => Promise<void>;
  toggleChecklistItem: (id: string) => Promise<void>;
  attachChecklistEvidence: (id: string, uri: string) => Promise<void>;
  submitChecklist: () => Promise<{ queued: boolean; submitted: boolean }>;
  addVisitor: (input: {
    name: string;
    phone: string;
    purpose: string;
    destination: string;
    flatId?: string | null;
    residentId?: string | null;
    visitorType: GuardVisitorEntry['visitorType'];
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
    lastMovementLocation: state.lastMovementLocation,
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

function shouldQueueMutation(state: Pick<GuardStore, 'isOfflineMode' | 'isNetworkOnline'>) {
  return state.isOfflineMode || !state.isNetworkOnline;
}

function withQueue(
  state: GuardStore,
  options: GuardMutationOptions,
): Pick<GuardPersistedState, 'lastSyncAt' | 'offlineQueue'> {
  if (shouldQueueMutation(state)) {
    return {
      lastSyncAt: state.lastSyncAt,
      offlineQueue: [
        {
          id: createId(options.queueType),
          actionType: options.queueType,
          label: options.label,
          payload: options.payload ?? null,
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

function mergeVisitorLog(existing: GuardVisitorEntry[], incoming: GuardVisitorEntry[]) {
  const merged = new Map<string, GuardVisitorEntry>();

  for (const entry of incoming) {
    merged.set(entry.backendId ?? entry.id, entry);
  }

  for (const entry of existing) {
    if (!entry.backendId) {
      merged.set(entry.id, entry);
    }
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime(),
  );
}

function getReplayableQueue(state: GuardStore) {
  return [...state.offlineQueue].sort(
    (left, right) =>
      new Date(left.queuedAt).getTime() - new Date(right.queuedAt).getTime(),
  );
}

function hasChecklistReopenOverride(items: GuardChecklistItem[]) {
  return items.some((item) => item.overrideStatus === 'approved');
}

function isChecklistLocked(state: Pick<GuardStore, 'checklistItems' | 'checklistSubmittedAt'>) {
  return Boolean(state.checklistSubmittedAt) && !hasChecklistReopenOverride(state.checklistItems);
}

function normalizeVisitorApprovalStatus(value: unknown): GuardVisitorEntry['approvalStatus'] {
  if (
    value === 'approved' ||
    value === 'denied' ||
    value === 'timed_out' ||
    value === 'checked_out' ||
    value === 'inside'
  ) {
    return value;
  }

  if (value === 'timeout') {
    return 'timed_out';
  }

  return 'pending';
}

function clearQueuedItem(state: GuardStore, queueItemId: string) {
  return {
    offlineQueue: state.offlineQueue.filter((item) => item.id !== queueItemId),
    lastSyncAt: new Date().toISOString(),
  };
}

function reconcileAttendanceQueueItem(
  state: GuardStore,
  payload: GuardAttendanceQueuePayload | null,
  queueItemId: string,
) {
  if (!payload) {
    return clearQueuedItem(state, queueItemId);
  }

  return {
    attendanceLog: state.attendanceLog.map((entry) =>
      entry.id === payload.localEntryId
        ? {
            ...entry,
            queued: false,
          }
        : entry,
    ),
    ...clearQueuedItem(state, queueItemId),
  };
}

function reconcilePreviewQueue(state: GuardStore) {
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
            status: 'sent' as const,
            streamingActive: Boolean(event.panicAlertId),
          }
        : event,
    ),
    offlineQueue: [],
    lastSyncAt: new Date().toISOString(),
  };
}

export const useGuardStore = create<GuardStore>((set, get) => ({
  ...createDefaultGuardState(null),
  isNetworkOnline: true,
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

  setNetworkOnline: (value) => {
    set((state) => (state.isNetworkOnline === value ? state : { isNetworkOnline: value }));
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
    const resetAt = new Date().toISOString();
    const currentLocation = get().lastKnownLocation;

    set((state) => ({
      lastMovementLocation: currentLocation ?? state.lastMovementLocation,
      lastPatrolResetAt: resetAt,
    }));

    await resetPatrolTrackingWindow(currentLocation).catch(() => {});
    await persistGuardStore(get);
  },

  updatePatrolLocation: async (location) => {
    let shouldReset = false;

    set((state) => {
      if (!state.lastMovementLocation) {
        shouldReset = true;
        return {
          lastKnownLocation: location,
          lastMovementLocation: location,
          lastPatrolResetAt: location.capturedAt,
        };
      }

      const distanceMoved = calculateDistanceMeters(
        state.lastMovementLocation.latitude,
        state.lastMovementLocation.longitude,
        location.latitude,
        location.longitude,
      );

      if (distanceMoved > MOVEMENT_THRESHOLD_METERS) {
        shouldReset = true;
        return {
          lastKnownLocation: location,
          lastMovementLocation: location,
          lastPatrolResetAt: location.capturedAt,
        };
      }

      return {
        lastKnownLocation: location,
      };
    });

    if (shouldReset) {
      await resetPatrolTrackingWindow(location).catch(() => {});
    }

    await persistGuardStore(get);
  },

  hydrateChecklistItems: async (items, submittedAt = null) => {
    set((state) => {
      const hasPendingChecklistReplay = state.offlineQueue.some((item) => item.actionType === 'checklist');

      if (hasPendingChecklistReplay) {
        return state;
      }

      return {
        checklistItems: items,
        checklistSubmittedAt: submittedAt,
      };
    });

    await persistGuardStore(get);
  },

  updateChecklistNumericValue: async (id, value) => {
    set((state) => {
      if (isChecklistLocked(state)) {
        return state;
      }

      return {
        checklistItems: state.checklistItems.map((item) =>
          item.id === id
            ? {
                ...item,
                completedAt: value.trim() ? new Date().toISOString() : null,
                numericValue: value,
                responseValue: value.trim() || null,
                status: value.trim() ? 'completed' : 'pending',
              }
            : item,
        ),
      };
    });

    await persistGuardStore(get);
  },

  hydrateVisitorLog: async (entries) => {
    set((state) => ({
      visitorLog: mergeVisitorLog(state.visitorLog, entries),
    }));

    await persistGuardStore(get);
  },

  hydrateEmergencyContacts: async (contacts) => {
    set({
      emergencyContacts: contacts,
    });

    await persistGuardStore(get);
  },

  clockIn: async (options) => {
    set((state) => {
      const entry: GuardAttendanceEntry = {
        id: createId('attendance'),
        action: 'clock_in',
        recordedAt: new Date().toISOString(),
        photoUri: options.photoUri,
        location: options.location,
        queued: shouldQueueMutation(state),
      };

      const queueState = withQueue(state, {
        label: 'Clock-in pending sync',
        queueType: 'attendance',
        payload: ({
          operation: 'clock_in',
          localEntryId: entry.id,
          photoUri: options.photoUri,
          location: options.location,
        } satisfies GuardAttendanceQueuePayload),
      });

      return {
        dutyStatus: 'on_duty',
        lastPatrolResetAt: entry.recordedAt,
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        lastMovementLocation: options.location ?? state.lastMovementLocation,
        attendanceLog: [entry, ...state.attendanceLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    if (options.location) {
      void startPatrolTracking(options.location.latitude, options.location.longitude).catch(
        () => {},
      );
    }
    void scheduleChecklistReminder().catch(() => {});
    return {
      queued: shouldQueueMutation(get()),
    };
  },

  clockOut: async (options) => {
    set((state) => {
      const entry: GuardAttendanceEntry = {
        id: createId('attendance'),
        action: 'clock_out',
        recordedAt: new Date().toISOString(),
        photoUri: options.photoUri,
        location: options.location,
        queued: shouldQueueMutation(state),
      };

      const queueState = withQueue(state, {
        label: 'Clock-out pending sync',
        queueType: 'attendance',
        payload: ({
          operation: 'clock_out',
          localEntryId: entry.id,
          photoUri: options.photoUri,
          location: options.location,
        } satisfies GuardAttendanceQueuePayload),
      });

      return {
        dutyStatus: 'off_duty',
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        lastMovementLocation: null,
        attendanceLog: [entry, ...state.attendanceLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    void stopPatrolTracking().catch(() => {});
    void cancelChecklistReminder().catch(() => {});
    return {
      queued: shouldQueueMutation(get()),
    };
  },

  triggerSos: async (options) => {
    const state = get();
    const profile = useAppStore.getState().profile;
    const queued = shouldQueueMutation(state);
    let panicAlertId: string | null = null;

    if (!queued && profile && !isPreviewProfile(profile)) {
      const backendResult = await startGuardPanicAlert({
        alertType: options.alertType ?? 'panic',
        note: options.note ?? '',
        location: options.location,
        photoUri: options.photoUri,
      });

      if (backendResult?.success === false) {
        throw new Error(backendResult.error ?? 'SOS could not be sent.');
      }

      panicAlertId =
        typeof backendResult?.alert_id === 'string' ? backendResult.alert_id : null;
    }

    const nextEventId = createId('sos');

    set((state) => {
      const nextEvent: GuardSosEvent = {
        id: nextEventId,
        panicAlertId,
        alertType: options.alertType ?? 'panic',
        note: options.note ?? '',
        recordedAt: new Date().toISOString(),
        status: queued ? 'queued' : 'sent',
        photoUri: options.photoUri,
        location: options.location,
        acknowledgedAt: null,
        resolvedAt: null,
        streamingActive: Boolean(panicAlertId),
      };

      const queueState = withQueue(state, {
        label:
          options.alertType === 'inactivity'
            ? 'Inactivity alert pending sync'
            : 'SOS alert pending sync',
        queueType: 'sos',
        payload: ({
          operation: 'panic_alert',
          localEventId: nextEvent.id,
          alertType: nextEvent.alertType,
          note: nextEvent.note,
          photoUri: nextEvent.photoUri,
          location: nextEvent.location,
        } satisfies GuardSosQueuePayload),
      });

      return {
        sosEvents: [nextEvent, ...state.sosEvents],
        lastKnownLocation: options.location ?? state.lastKnownLocation,
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued,
      eventId: nextEventId,
    };
  },

  attachSosEvidence: async (eventId, photoUri) => {
    const event = get().sosEvents.find((e) => e.id === eventId);
    const profile = useAppStore.getState().profile;
    
    if (event?.panicAlertId && !shouldQueueMutation(get()) && profile && !isPreviewProfile(profile)) {
      try {
        const { attachPanicAlertEvidence } = await import('../lib/mobileBackend');
        await attachPanicAlertEvidence(event.panicAlertId, photoUri);
      } catch (error) {
        // Keep evidence local if upload fails
      }
    }

    set((state) => ({
      sosEvents: state.sosEvents.map((event) =>
        event.id === eventId
          ? {
              ...event,
              photoUri,
              note: 'Guard manually triggered the panic workflow. SOS evidence was captured automatically.',
            }
          : event,
      ),
      offlineQueue: state.offlineQueue.map((item) => {
        if (item.actionType === 'sos' && item.payload && 'localEventId' in item.payload && item.payload.localEventId === eventId) {
          return {
            ...item,
            payload: {
              ...item.payload,
              photoUri,
              note: 'Guard manually triggered the panic workflow. SOS evidence was captured automatically.',
            },
          };
        }
        return item;
      })
    }));

    await persistGuardStore(get);
  },

  stopSosStreaming: async (eventId) => {
    set((state) => ({
      sosEvents: state.sosEvents.map((event) =>
        event.id === eventId
          ? {
              ...event,
              streamingActive: false,
            }
          : event,
      ),
    }));

    await persistGuardStore(get);
  },

  toggleChecklistItem: async (id) => {
    set((state) => {
      if (isChecklistLocked(state)) {
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
      if (isChecklistLocked(state)) {
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

    if (!isReadyToSubmit || isChecklistLocked(state)) {
      return {
        queued: false,
        submitted: false,
      };
    }

    set((currentState) => {
      const checklistSubmittedAt = new Date().toISOString();
      const queueState = withQueue(currentState, {
        label: 'Checklist submission pending sync',
        queueType: 'checklist',
        payload: ({
          operation: 'submit',
          checklistSubmittedAt,
          items: currentState.checklistItems,
        } satisfies GuardChecklistQueuePayload),
      });

      return {
        checklistSubmittedAt,
        checklistItems: currentState.checklistItems.map((item) =>
          item.overrideStatus === 'approved'
            ? {
                ...item,
                overrideStatus: 'resubmitted',
              }
            : item,
        ),
        ...queueState,
      };
    });

    await persistGuardStore(get);
    void cancelChecklistReminder().catch(() => {});
    return {
      queued: shouldQueueMutation(get()),
      submitted: true,
    };
  },

  addVisitor: async (input) => {
    set((state) => {
      const nextVisitor: GuardVisitorEntry = {
        id: createId('visitor'),
        backendId: null,
        visitorType: input.visitorType,
        name: input.name,
        phone: input.phone,
        purpose: input.purpose,
        destination: input.destination,
        flatId: input.flatId ?? null,
        residentId: input.residentId ?? null,
        entryLocationName: null,
        vehicleNumber: input.vehicleNumber,
        photoUri: input.photoUri,
        photoUrl: null,
        recordedAt: new Date().toISOString(),
        status: 'inside',
        frequentVisitor: input.frequentVisitor,
        approvalStatus: input.visitorType === 'delivery' ? 'approved' : 'pending',
        approvalDeadlineAt: null,
        decisionAt: null,
      };

      const queueState = withQueue(state, {
        label: `Visitor entry pending sync: ${input.name}`,
        queueType: 'visitor',
        payload: ({
          operation: 'create_entry',
          localVisitorId: nextVisitor.id,
          flatId: nextVisitor.flatId,
          residentId: nextVisitor.residentId,
          name: nextVisitor.name,
          phone: nextVisitor.phone,
          purpose: nextVisitor.purpose,
          destination: nextVisitor.destination,
          vehicleNumber: nextVisitor.vehicleNumber,
          photoUri: nextVisitor.photoUri,
          frequentVisitor: nextVisitor.frequentVisitor,
          visitorType: nextVisitor.visitorType,
        } satisfies GuardVisitorEntryQueuePayload),
      });

      return {
        visitorLog: [nextVisitor, ...state.visitorLog],
        ...queueState,
      };
    });

    await persistGuardStore(get);
    return {
      queued: shouldQueueMutation(get()),
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
        payload: ({
          operation: 'checkout',
          localVisitorId: id,
          backendId: visitor.backendId,
          visitorName: visitor.name,
        } satisfies GuardVisitorCheckoutQueuePayload),
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
      queued: shouldQueueMutation(get()),
      updated: true,
    };
  },

  flushOfflineQueue: async () => {
    const state = get();
    const queue = getReplayableQueue(state);

    if (!queue.length || state.isOfflineMode || !state.isNetworkOnline) {
      return 0;
    }

    const profile = useAppStore.getState().profile;

    if (!profile || isPreviewProfile(profile)) {
      set((currentState) => reconcilePreviewQueue(currentState));
      await persistGuardStore(get);
      return queue.length;
    }

    let replayedCount = 0;

    for (const queueItem of queue) {
      try {
        if (queueItem.actionType === 'attendance') {
          const payload = queueItem.payload as GuardAttendanceQueuePayload | null;

          set((currentState) => ({
            ...reconcileAttendanceQueueItem(currentState, payload, queueItem.id),
          }));
          replayedCount += 1;
          continue;
        }

        if (queueItem.actionType === 'sos') {
          const payload = queueItem.payload as GuardSosQueuePayload | null;

          if (!payload) {
            continue;
          }

          const result = await startGuardPanicAlert({
            alertType: payload.alertType,
            note: payload.note,
            location: payload.location,
            photoUri: payload.photoUri,
          });

          if (result?.success === false) {
            continue;
          }

          set((currentState) => ({
            sosEvents: currentState.sosEvents.map((event) =>
              event.id === payload.localEventId
                ? {
                    ...event,
                    panicAlertId:
                      typeof result?.alert_id === 'string' ? result.alert_id : event.panicAlertId,
                    status: 'sent',
                    streamingActive: Boolean(
                      typeof result?.alert_id === 'string' ? result.alert_id : event.panicAlertId,
                    ),
                  }
                : event,
            ),
            ...clearQueuedItem(currentState, queueItem.id),
          }));
          replayedCount += 1;
          continue;
        }

        if (queueItem.actionType === 'checklist') {
          const payload = queueItem.payload as GuardChecklistQueuePayload | null;

          if (!payload?.items?.length) {
            continue;
          }

          const result = await submitGuardChecklist(payload.items);

          if (result?.success === false) {
            continue;
          }

          set((currentState) => ({
            ...clearQueuedItem(currentState, queueItem.id),
          }));
          replayedCount += 1;
          continue;
        }

        if (queueItem.actionType === 'visitor') {
          const payload = queueItem.payload as
            | GuardVisitorEntryQueuePayload
            | GuardVisitorCheckoutQueuePayload
            | null;

          if (!payload) {
            continue;
          }

          if (payload.operation === 'create_entry') {
            if (!payload.flatId) {
              continue;
            }

            const result = await createGuardVisitorEntry({
              destination: payload.destination,
              flatId: payload.flatId,
              isFrequentVisitor: payload.frequentVisitor,
              phone: payload.phone,
              photoUri: payload.photoUri,
              purpose: payload.purpose,
              vehicleNumber: payload.vehicleNumber,
              visitorType: payload.visitorType,
              visitorName: payload.name,
            });

            if (result?.success === false) {
              continue;
            }

            const visitorRow =
              result && typeof result === 'object' && 'visitor' in result && result.visitor
                ? (result.visitor as Record<string, unknown>)
                : null;
            const backendId =
              typeof result?.visitor_id === 'string'
                ? result.visitor_id
                : typeof visitorRow?.id === 'string'
                  ? visitorRow.id
                  : null;

            set((currentState) => ({
              visitorLog: currentState.visitorLog.map((entry) =>
                entry.id === payload.localVisitorId
                  ? {
                      ...entry,
                      backendId,
                      visitorType:
                        visitorRow?.visitor_type === 'delivery' ? 'delivery' : entry.visitorType,
                      approvalStatus: normalizeVisitorApprovalStatus(visitorRow?.approval_status),
                      approvalDeadlineAt:
                        typeof visitorRow?.approval_deadline_at === 'string'
                          ? visitorRow.approval_deadline_at
                          : entry.approvalDeadlineAt,
                      decisionAt:
                        typeof visitorRow?.decision_at === 'string'
                          ? visitorRow.decision_at
                          : entry.decisionAt,
                      entryLocationName:
                        typeof visitorRow?.entry_location_name === 'string'
                          ? visitorRow.entry_location_name
                          : entry.entryLocationName,
                    }
                  : entry,
              ),
              ...clearQueuedItem(currentState, queueItem.id),
            }));
            replayedCount += 1;
            continue;
          }

          const visitor = get().visitorLog.find((entry) => entry.id === payload.localVisitorId);
          const backendId = payload.backendId ?? visitor?.backendId ?? null;

          if (!backendId) {
            continue;
          }

          const result = await checkoutGuardVisitor(backendId, profile.userId);

          if (result?.success === false) {
            continue;
          }

          set((currentState) => ({
            visitorLog: currentState.visitorLog.map((entry) =>
              entry.id === payload.localVisitorId
                ? {
                    ...entry,
                    backendId,
                    approvalStatus: 'checked_out',
                    status: 'checked_out',
                  }
                : entry,
            ),
            ...clearQueuedItem(currentState, queueItem.id),
          }));
          replayedCount += 1;
        }
      } catch {
        // Keep the queued action in place for the next reconnect or manual retry.
      }
    }

    if (replayedCount > 0) {
      await persistGuardStore(get);
    }

    return replayedCount;
  },
}));
