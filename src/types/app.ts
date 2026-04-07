import type { Session } from '@supabase/supabase-js';

export type AppColorScheme = 'light' | 'dark';

export type AppRole =
  | 'admin'
  | 'company_md'
  | 'company_hod'
  | 'account'
  | 'delivery_boy'
  | 'buyer'
  | 'supplier'
  | 'vendor'
  | 'security_guard'
  | 'security_supervisor'
  | 'society_manager'
  | 'service_boy'
  | 'storekeeper'
  | 'site_supervisor'
  | 'super_admin'
  | 'ac_technician'
  | 'pest_control_technician'
  | 'employee';

export interface LocationSummary {
  id: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  locationType: string | null;
  geoFenceRadius: number;
}

export interface GeoCalibrationRecord {
  calibratedAt: string;
  latitude: number;
  locationId: string;
  locationName: string;
  longitude: number;
  radius: number;
}

export interface LocalOnboardingState {
  biometricEnabled: boolean;
  biometricPrompted: boolean;
  geoCalibration: GeoCalibrationRecord | null;
}

export interface AppUserProfile {
  userId: string;
  session: Session | null;
  role: AppRole | null;
  fullName: string | null;
  phone: string | null;
  isActive: boolean;
  preferences: Record<string, unknown>;
  employeeId: string | null;
  employeeCode: string | null;
  employeePhotoUrl: string | null;
  guardId: string | null;
  guardCode: string | null;
  assignedLocation: LocationSummary | null;
}

export type OnboardingStep = 'biometric' | 'profile-photo' | 'geo-fence' | null;
