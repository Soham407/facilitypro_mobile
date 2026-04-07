import { create } from 'zustand';
import {
  fetchHrmsAttendanceRecords,
  recordHrmsAttendance,
  fetchHrmsDashboardData,
  fetchHrmsDocuments,
  fetchHrmsLeaveSnapshot,
  submitHrmsLeaveApplication,
  uploadHrmsDocument,
  type LeaveSubmissionInput,
  type DocumentUploadInput,
} from '../lib/hrms';
import { startHrmsTracking, stopHrmsTracking } from '../lib/hrmsTask';
import type { AppUserProfile, LocalOnboardingState } from '../types/app';
import type {
  HrmsAttendanceRecord,
  HrmsDashboardData,
  HrmsDocument,
  HrmsLeaveApplication,
  HrmsLeaveType,
  HrmsPayslip,
} from '../types/hrms';

interface HrmsState {
  attendance: HrmsAttendanceRecord[];
  leaveTypes: HrmsLeaveType[];
  leaveApplications: HrmsLeaveApplication[];
  payslips: HrmsPayslip[];
  documents: HrmsDocument[];
  isLoading: boolean;
  error: string | null;
  
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  clockIn: (profile: AppUserProfile | null, onboarding: LocalOnboardingState, selfieUri: string, mimeType?: string) => Promise<void>;
  clockOut: (profile: AppUserProfile | null, onboarding: LocalOnboardingState, selfieUri: string, mimeType?: string) => Promise<void>;
  submitLeave: (input: LeaveSubmissionInput) => Promise<void>;
  uploadDoc: (input: DocumentUploadInput) => Promise<void>;
  refreshDashboard: (profile: AppUserProfile | null) => Promise<void>;
}

export const useHrmsStore = create<HrmsState>((set, get) => ({
  attendance: [],
  leaveTypes: [],
  leaveApplications: [],
  payslips: [],
  documents: [],
  isLoading: false,
  error: null,

  bootstrap: async (profile) => {
    if (!profile) return;
    set({ isLoading: true, error: null });
    try {
      const data = await fetchHrmsDashboardData(profile);
      set({
        attendance: data.attendance,
        leaveTypes: data.leaveTypes,
        leaveApplications: data.leaveApplications,
        payslips: data.payslips,
        documents: data.documents,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: 'Failed to load HRMS data' });
    }
  },

  clockIn: async (profile, onboarding, selfieUri, mimeType) => {
    if (!profile) return;
    set({ isLoading: true });
    try {
      const record = await recordHrmsAttendance({
        action: 'check-in',
        profile,
        onboarding,
        selfieUri,
        mimeType,
      });
      
      set((state) => ({
        attendance: [record, ...state.attendance.filter(r => r.logDate !== record.logDate)],
        isLoading: false,
      }));

      if (profile.employeeId) {
        await startHrmsTracking(profile.employeeId);
      }
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Clock-in failed' });
      throw err;
    }
  },

  clockOut: async (profile, onboarding, selfieUri, mimeType) => {
    if (!profile) return;
    set({ isLoading: true });
    try {
      const record = await recordHrmsAttendance({
        action: 'check-out',
        profile,
        onboarding,
        selfieUri,
        mimeType,
      });
      
      set((state) => ({
        attendance: [record, ...state.attendance.filter(r => r.logDate !== record.logDate)],
        isLoading: false,
      }));

      await stopHrmsTracking();
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Clock-out failed' });
      throw err;
    }
  },

  submitLeave: async (input) => {
    set({ isLoading: true });
    try {
      const record = await submitHrmsLeaveApplication(input);
      set((state) => ({
        leaveApplications: [record, ...state.leaveApplications],
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false, error: 'Failed to submit leave' });
      throw err;
    }
  },

  uploadDoc: async (input) => {
    set({ isLoading: true });
    try {
      const record = await uploadHrmsDocument(input);
      set((state) => ({
        documents: [record, ...state.documents],
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false, error: 'Failed to upload document' });
      throw err;
    }
  },

  refreshDashboard: async (profile) => {
    if (!profile) return;
    try {
      const data = await fetchHrmsDashboardData(profile);
      set({
        attendance: data.attendance,
        leaveTypes: data.leaveTypes,
        leaveApplications: data.leaveApplications,
        payslips: data.payslips,
        documents: data.documents,
      });
    } catch (err) {
      // Background refresh silent fail
    }
  },
}));
