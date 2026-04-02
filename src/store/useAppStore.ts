import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { signOut as signOutRequest } from '../lib/auth';
import { getBiometricCapability, type BiometricCapability } from '../lib/biometrics';
import { fetchCurrentAppProfile, saveGeoCalibrationToProfile } from '../lib/profile';
import {
  clearLastActivityAt,
  loadLastActivityAt,
  loadLocalOnboardingState,
  saveBiometricPreference,
  saveGeoCalibration,
  saveLastActivityAt,
} from '../lib/storage';
import { supabase } from '../lib/supabase';
import type {
  AppRole,
  AppUserProfile,
  GeoCalibrationRecord,
  LocalOnboardingState,
} from '../types/app';

const DEFAULT_ONBOARDING_STATE: LocalOnboardingState = {
  biometricEnabled: false,
  biometricPrompted: false,
  geoCalibration: null,
};

const DEFAULT_BIOMETRIC_CAPABILITY: BiometricCapability = {
  available: false,
  hasHardware: false,
  isEnrolled: false,
  label: 'Biometric',
};

const ACTIVITY_PERSIST_THROTTLE_MS = 30000;

function createDevPreviewIdentity(role: AppRole) {
  switch (role) {
    case 'security_supervisor':
      return {
        userId: 'dev-preview-supervisor',
        phone: '+918888888888',
        fullName: 'Preview Supervisor',
        employeeCode: 'SUP-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'society_manager':
      return {
        userId: 'dev-preview-manager',
        phone: '+917777777777',
        fullName: 'Preview Manager',
        employeeCode: 'MGR-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'employee':
      return {
        userId: 'dev-preview-employee',
        phone: '+916666666666',
        fullName: 'Preview Employee',
        employeeCode: 'EMP-HRMS-001',
        guardId: null,
        guardCode: null,
      };
    case 'buyer':
      return {
        userId: 'dev-preview-buyer',
        phone: '+915555555555',
        fullName: 'Preview Buyer',
        employeeCode: 'BUY-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'ac_technician':
      return {
        userId: 'dev-preview-ac-technician',
        phone: '+912222222222',
        fullName: 'Preview AC Technician',
        employeeCode: 'ACT-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'pest_control_technician':
      return {
        userId: 'dev-preview-pest-technician',
        phone: '+911111111111',
        fullName: 'Preview Pest Technician',
        employeeCode: 'PCT-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'delivery_boy':
      return {
        userId: 'dev-preview-delivery',
        phone: '+912121212121',
        fullName: 'Preview Delivery Runner',
        employeeCode: 'DLV-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'service_boy':
      return {
        userId: 'dev-preview-service-boy',
        phone: '+912323232323',
        fullName: 'Preview Service Boy',
        employeeCode: 'SRV-DEV-001',
        guardId: null,
        guardCode: null,
      };
    case 'supplier':
      return {
        userId: 'dev-preview-supplier',
        phone: '+914444444444',
        fullName: 'Preview Supplier',
        employeeCode: 'SUP-PORTAL-001',
        guardId: null,
        guardCode: null,
      };
    case 'resident':
      return {
        userId: 'dev-preview-resident',
        phone: '+914141414141',
        fullName: 'Preview Resident',
        employeeCode: null,
        guardId: null,
        guardCode: null,
      };
    case 'vendor':
      return {
        userId: 'dev-preview-vendor',
        phone: '+913333333333',
        fullName: 'Preview Vendor',
        employeeCode: 'VEN-PORTAL-001',
        guardId: null,
        guardCode: null,
      };
    default:
      return {
        userId: 'dev-preview-guard',
        phone: '+919999999999',
        fullName: 'Preview Guard',
        employeeCode: 'EMP-DEV-001',
        guardId: 'dev-preview-guard',
        guardCode: 'GRD-DEV-001',
      };
  }
}

function createDevPreviewSession(role: AppRole): Session {
  const issuedAt = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const identity = createDevPreviewIdentity(role);

  return {
    access_token: 'dev-preview-access-token',
    refresh_token: 'dev-preview-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 12,
    expires_at: expiresAt,
    user: {
      app_metadata: {
        provider: 'phone',
        providers: ['phone'],
      },
      user_metadata: {
        previewMode: true,
        previewRole: role,
      },
      aud: 'authenticated',
      created_at: issuedAt,
      updated_at: issuedAt,
      phone: identity.phone,
      role: 'authenticated',
      id: identity.userId,
    },
  } as Session;
}

function createDevPreviewGeoCalibration(): GeoCalibrationRecord {
  return {
    calibratedAt: new Date().toISOString(),
    latitude: 19.076,
    longitude: 72.8777,
    locationId: 'dev-preview-location',
    locationName: 'Preview Tower',
    radius: 120,
  };
}

function createDevPreviewProfile(session: Session, role: AppRole): AppUserProfile {
  const isGuard = role === 'security_guard';
  const isResident = role === 'resident';
  const identity = createDevPreviewIdentity(role);

  return {
    userId: session.user.id,
    session,
    role,
    fullName: identity.fullName,
    phone: session.user.phone ?? identity.phone,
    isActive: true,
    preferences: {
      previewMode: true,
      previewRole: role,
    },
    employeeId: isResident ? null : 'dev-preview-employee',
    employeeCode: identity.employeeCode,
    employeePhotoUrl: 'dev-preview-photo.jpg',
    guardId: isGuard ? identity.guardId : null,
    guardCode: isGuard ? identity.guardCode : null,
    assignedLocation: {
      id: 'dev-preview-location',
      address: 'Preview site for UI testing',
      latitude: 19.076,
      longitude: 72.8777,
      locationName: 'Preview Tower',
      locationType: 'site',
      geoFenceRadius: 120,
    },
  };
}

interface AppState {
  isBootstrapping: boolean;
  session: Session | null;
  profile: AppUserProfile | null;
  onboarding: LocalOnboardingState;
  biometricCapability: BiometricCapability;
  isBiometricLocked: boolean;
  lastActivityAt: number | null;
  bootstrap: () => Promise<void>;
  enterDevPreview: (role?: AppRole) => Promise<void>;
  handleSession: (session: Session | null, options?: { lockWithBiometrics?: boolean }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeBiometricPrompt: (enabled: boolean) => Promise<void>;
  completeGeoCalibration: (record: GeoCalibrationRecord) => Promise<void>;
  recordActivity: (force?: boolean) => Promise<void>;
  setBiometricLocked: (locked: boolean) => void;
  signOut: () => Promise<void>;
}

async function getPersistedSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export const useAppStore = create<AppState>((set, get) => ({
  isBootstrapping: true,
  session: null,
  profile: null,
  onboarding: DEFAULT_ONBOARDING_STATE,
  biometricCapability: DEFAULT_BIOMETRIC_CAPABILITY,
  isBiometricLocked: false,
  lastActivityAt: null,

  bootstrap: async () => {
    set({
      isBootstrapping: true,
    });

    const [onboarding, biometricCapability, lastActivityAt, session] = await Promise.all([
      loadLocalOnboardingState(),
      getBiometricCapability(),
      loadLastActivityAt(),
      getPersistedSession(),
    ]);

    let profile: AppUserProfile | null = null;

    if (session) {
      profile = await fetchCurrentAppProfile();

      if (profile) {
        profile = {
          ...profile,
          session,
        };
      }
    }

    set({
      isBootstrapping: false,
      onboarding,
      biometricCapability,
      session,
      profile,
      lastActivityAt,
      isBiometricLocked: Boolean(session && onboarding.biometricEnabled && biometricCapability.available),
    });
  },

  enterDevPreview: async (role = 'security_guard') => {
    const session = createDevPreviewSession(role);
    const profile = createDevPreviewProfile(session, role);
    const geoCalibration = createDevPreviewGeoCalibration();
    const now = Date.now();

    set({
      session,
      profile,
      onboarding: {
        biometricEnabled: false,
        biometricPrompted: true,
        geoCalibration,
      },
      isBiometricLocked: false,
      lastActivityAt: now,
    });

    await saveLastActivityAt(now);
  },

  handleSession: async (session, options) => {
    if (!session) {
      set({
        session: null,
        profile: null,
        isBiometricLocked: false,
        lastActivityAt: null,
      });

      await clearLastActivityAt();
      return;
    }

    const profile = await fetchCurrentAppProfile();

    set((state) => ({
      session,
      profile: profile
        ? {
            ...profile,
            session,
          }
        : null,
      isBiometricLocked:
        options?.lockWithBiometrics ??
        Boolean(state.onboarding.biometricEnabled && state.biometricCapability.available),
    }));

    await get().recordActivity(true);
  },

  refreshProfile: async () => {
    const session = get().session;

    if (!session) {
      return;
    }

    const nextProfile = await fetchCurrentAppProfile();

    set({
      profile: nextProfile
        ? {
            ...nextProfile,
            session,
          }
        : null,
    });
  },

  completeBiometricPrompt: async (enabled) => {
    await saveBiometricPreference({
      enabled,
      prompted: true,
    });

    set((state) => ({
      onboarding: {
        ...state.onboarding,
        biometricEnabled: enabled,
        biometricPrompted: true,
      },
      isBiometricLocked: false,
    }));
  },

  completeGeoCalibration: async (record) => {
    await saveGeoCalibration(record);

    const currentSession = get().session;

    if (currentSession) {
      await saveGeoCalibrationToProfile(currentSession.user.id, record);
    }

    set((state) => ({
      onboarding: {
        ...state.onboarding,
        geoCalibration: record,
      },
    }));
  },

  recordActivity: async (force = false) => {
    const now = Date.now();
    const previousActivity = get().lastActivityAt ?? 0;

    if (!force && now - previousActivity < ACTIVITY_PERSIST_THROTTLE_MS) {
      set({
        lastActivityAt: now,
      });
      return;
    }

    set({
      lastActivityAt: now,
    });

    await saveLastActivityAt(now);
  },

  setBiometricLocked: (locked) => {
    set({
      isBiometricLocked: locked,
    });
  },

  signOut: async () => {
    const persistedOnboarding = await loadLocalOnboardingState();

    try {
      await signOutRequest();
    } finally {
      set(() => ({
        session: null,
        profile: null,
        isBiometricLocked: false,
        lastActivityAt: null,
        onboarding: persistedOnboarding,
      }));

      await clearLastActivityAt();
    }
  },
}));
