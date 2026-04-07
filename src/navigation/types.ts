import type { AppRole } from '../types/app';

export type AuthStackParamList = {
  Login: undefined;
  OTP: { phone: string };
};

export type OnboardingStackParamList = {
  BiometricSetup: undefined;
  ProfilePhoto: undefined;
  GeoFenceCalibration: undefined;
};

export type RoleStackParamList = {
  RoleLanding: { role: AppRole | null } | undefined;
};

export type HRMSTabParamList = {
  HRMSHome: undefined;
  HRMSAttendance: undefined;
  HRMSLeave: undefined;
  HRMSPayslips: undefined;
  HRMSDocuments: undefined;
};

export type HrmsSubStackParamList = {
  HrmsDashboard: undefined;
  HrmsAttendance: undefined;
  HrmsLeave: undefined;
  HrmsPayslips: undefined;
  HrmsDocuments: undefined;
};

export type OversightTabParamList = {
  OversightHome: undefined;
  OversightAlerts: undefined;
  OversightOperations: undefined;
  OversightTickets: undefined;
  OversightStaff: { screen?: keyof HrmsSubStackParamList } | undefined;
};

export type GuardTabParamList = {
  GuardHome: undefined;
  GuardChecklist: undefined;
  GuardVisitors: undefined;
  GuardStaff: { screen?: keyof HrmsSubStackParamList } | undefined;
  GuardContacts: undefined;
};

export type ServiceTabParamList = {
  ServiceHome: undefined;
  ServiceTasks: undefined;
  ServiceMaterials: undefined;
  ServiceStaff: { screen?: keyof HrmsSubStackParamList } | undefined;
  ServiceProof: undefined;
};

export type BuyerTabParamList = {
  BuyerHome: undefined;
  BuyerRequests: undefined;
  BuyerInvoices: undefined;
  BuyerFeedback: undefined;
};

export type SupplierTabParamList = {
  SupplierHome: undefined;
  SupplierIndents: undefined;
  SupplierOrders: undefined;
  SupplierBilling: undefined;
};
