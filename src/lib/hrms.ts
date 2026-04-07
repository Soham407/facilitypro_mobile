import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppUserProfile, LocalOnboardingState } from '../types/app';
import type {
  HrmsAttendanceRecord,
  HrmsDashboardData,
  HrmsDocument,
  HrmsDocumentType,
  HrmsGeoFenceStatus,
  HrmsLeaveApplication,
  HrmsLeaveType,
  HrmsPayslip,
} from '../types/hrms';
import { calculateDistanceMeters, getCurrentLocationFix } from './location';
import { supabase } from './supabase';

const ATTENDANCE_DRAFT_KEY_PREFIX = 'facilitypro:hrms:attendance';
const LEAVE_DRAFT_KEY_PREFIX = 'facilitypro:hrms:leave';
const DOCUMENT_DRAFT_KEY_PREFIX = 'facilitypro:hrms:documents';
const DEFAULT_GEO_FENCE_RADIUS_METERS = 50;

const FALLBACK_LEAVE_TYPES = [
  {
    id: 'fallback-sick-leave',
    code: 'sick_leave',
    name: 'Sick Leave',
    yearlyQuota: 12,
  },
  {
    id: 'fallback-casual-leave',
    code: 'casual_leave',
    name: 'Casual Leave',
    yearlyQuota: 12,
  },
  {
    id: 'fallback-paid-leave',
    code: 'paid_leave',
    name: 'Paid Leave',
    yearlyQuota: 18,
  },
  {
    id: 'fallback-emergency-leave',
    code: 'emergency_leave',
    name: 'Emergency Leave',
    yearlyQuota: 3,
  },
];

export interface AttendanceActionInput {
  action: 'check-in' | 'check-out';
  mimeType?: string;
  onboarding: LocalOnboardingState;
  profile: AppUserProfile | null;
  selfieUri: string;
}

export interface LeaveSubmissionInput {
  fromDate: string;
  leaveTypeCode: string;
  leaveTypeId: string;
  leaveTypeName: string;
  profile: AppUserProfile | null;
  reason: string;
  toDate: string;
}

export interface DocumentUploadInput {
  documentNumber?: string;
  documentType: HrmsDocumentType;
  issueDate?: string;
  mimeType?: string;
  notes?: string;
  profile: AppUserProfile | null;
  sourceUri: string;
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPreviewProfile(profile: AppUserProfile | null) {
  return profile?.preferences.previewMode === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHrmsDocumentType(value: string): value is HrmsDocumentType {
  return [
    'aadhar',
    'pan',
    'voter_id',
    'passport',
    'psara',
    'police_verification',
    'other',
  ].includes(value);
}

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getStorageKey(prefix: string, employeeId: string | null) {
  return `${prefix}:${employeeId ?? 'anonymous'}`;
}

async function readStoredArray<T>(key: string): Promise<T[]> {
  const rawValue = await AsyncStorage.getItem(key);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as T[];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

async function writeStoredArray<T>(key: string, value: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function calculateHourDelta(start: string | null, end: string | null) {
  if (!start || !end) {
    return null;
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return Math.round(((endMs - startMs) / (1000 * 60 * 60)) * 100) / 100;
}

export function calculateInclusiveLeaveDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const delta = to.getTime() - from.getTime();

  if (!Number.isFinite(delta) || delta < 0) {
    return 0;
  }

  return Math.floor(delta / (1000 * 60 * 60 * 24)) + 1;
}

function resolveGeoFence(
  profile: AppUserProfile | null,
  onboarding: LocalOnboardingState,
): Omit<HrmsGeoFenceStatus, 'distanceMeters' | 'withinFence'> | null {
  if (
    onboarding.geoCalibration &&
    Number.isFinite(onboarding.geoCalibration.latitude) &&
    Number.isFinite(onboarding.geoCalibration.longitude)
  ) {
    return {
      locationId: onboarding.geoCalibration.locationId,
      locationName: onboarding.geoCalibration.locationName,
      latitude: onboarding.geoCalibration.latitude,
      longitude: onboarding.geoCalibration.longitude,
      radiusMeters: onboarding.geoCalibration.radius,
    };
  }

  if (
    profile?.assignedLocation &&
    profile.assignedLocation.latitude !== null &&
    profile.assignedLocation.longitude !== null
  ) {
    return {
      locationId: profile.assignedLocation.id,
      locationName: profile.assignedLocation.locationName,
      latitude: profile.assignedLocation.latitude,
      longitude: profile.assignedLocation.longitude,
      radiusMeters:
        profile.assignedLocation.geoFenceRadius || DEFAULT_GEO_FENCE_RADIUS_METERS,
    };
  }

  return null;
}

function mergeAttendance(
  remoteRecords: HrmsAttendanceRecord[],
  localRecords: HrmsAttendanceRecord[],
) {
  const merged = new Map<string, HrmsAttendanceRecord>();

  for (const item of remoteRecords) {
    merged.set(item.logDate, item);
  }

  for (const item of localRecords) {
    merged.set(item.logDate, item);
  }

  return [...merged.values()].sort((left, right) => right.logDate.localeCompare(left.logDate));
}

function mergeById<T extends { id: string }>(remoteRecords: T[], localRecords: T[]) {
  const merged = new Map<string, T>();

  for (const item of remoteRecords) {
    merged.set(item.id, item);
  }

  for (const item of localRecords) {
    merged.set(item.id, item);
  }

  return [...merged.values()];
}

function mapAttendanceRow(row: Record<string, unknown>): HrmsAttendanceRecord {
  return {
    id: String(row.id ?? createLocalId('attendance')),
    logDate: String(row.log_date ?? toIsoDate()),
    checkInTime: typeof row.check_in_time === 'string' ? row.check_in_time : null,
    checkOutTime: typeof row.check_out_time === 'string' ? row.check_out_time : null,
    totalHours: toNumber(row.total_hours),
    status: typeof row.status === 'string' ? row.status : null,
    syncStatus: 'synced',
    lastSelfieUri: null,
    geoFenceStatus: null,
    note: null,
  };
}

function mapLeaveApplicationRow(row: Record<string, unknown>): HrmsLeaveApplication {
  const relatedType = isRecord(row.leave_types) ? row.leave_types : null;

  return {
    id: String(row.id ?? createLocalId('leave')),
    leaveTypeId: String(row.leave_type_id ?? relatedType?.id ?? ''),
    leaveTypeName:
      typeof relatedType?.leave_name === 'string' ? relatedType.leave_name : 'Leave Request',
    leaveTypeCode:
      typeof relatedType?.leave_type === 'string' ? relatedType.leave_type : 'leave_request',
    fromDate: String(row.from_date ?? toIsoDate()),
    toDate: String(row.to_date ?? toIsoDate()),
    numberOfDays: toNumber(row.number_of_days) ?? 0,
    reason: typeof row.reason === 'string' ? row.reason : '',
    status: typeof row.status === 'string' ? row.status : 'pending',
    approvedAt: typeof row.approved_at === 'string' ? row.approved_at : null,
    rejectionReason:
      typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    syncStatus: 'synced',
    note: null,
  };
}

function mapLeaveTypeRow(row: Record<string, unknown>): HrmsLeaveType {
  const code = typeof row.leave_type === 'string' ? row.leave_type : 'leave_request';

  return {
    id: String(row.id ?? createLocalId(code)),
    code,
    name: typeof row.leave_name === 'string' ? row.leave_name : 'Leave',
    yearlyQuota: toNumber(row.yearly_quota) ?? 0,
    remainingDays: toNumber(row.yearly_quota) ?? 0,
    requiresApproval:
      typeof row.requires_approval === 'boolean' ? row.requires_approval : true,
    description: typeof row.description === 'string' ? row.description : null,
  };
}

function mapPayslipRow(row: Record<string, unknown>): HrmsPayslip {
  const paymentReference =
    typeof row.payment_reference === 'string' ? row.payment_reference : null;

  return {
    id: String(row.id ?? createLocalId('payslip')),
    payslipNumber:
      typeof row.payslip_number === 'string' ? row.payslip_number : 'PAYSLIP',
    payPeriodFrom: String(row.pay_period_from ?? toIsoDate()),
    payPeriodTo: String(row.pay_period_to ?? toIsoDate()),
    workingDays: toNumber(row.working_days),
    presentDays: toNumber(row.present_days),
    absentDays: toNumber(row.absent_days),
    leaveDays: toNumber(row.leave_days),
    basicSalary: toNumber(row.basic_salary),
    hra: toNumber(row.hra),
    specialAllowance: toNumber(row.special_allowance),
    overtimeAmount: toNumber(row.overtime_amount),
    grossSalary: toNumber(row.gross_salary) ?? 0,
    pfEmployee: toNumber(row.pf_employee),
    esicEmployee: toNumber(row.esic_employee),
    professionalTax: toNumber(row.professional_tax),
    tds: toNumber(row.tds),
    otherDeductions: toNumber(row.other_deductions),
    totalDeductions: toNumber(row.total_deductions) ?? 0,
    netSalary: toNumber(row.net_salary) ?? 0,
    paymentStatus: typeof row.payment_status === 'string' ? row.payment_status : null,
    paymentDate: typeof row.payment_date === 'string' ? row.payment_date : null,
    paymentReference,
    pdfUrl:
      paymentReference && /^https?:\/\//i.test(paymentReference)
        ? paymentReference
        : null,
  };
}

function mapDocumentRow(row: Record<string, unknown>): HrmsDocument {
  const rawType = typeof row.document_type === 'string' ? row.document_type : 'other';

  return {
    id: String(row.id ?? createLocalId('document')),
    documentType: isHrmsDocumentType(rawType) ? rawType : 'other',
    documentNumber:
      typeof row.document_number === 'string' ? row.document_number : null,
    documentUrl: typeof row.document_url === 'string' ? row.document_url : null,
    issueDate: typeof row.issue_date === 'string' ? row.issue_date : null,
    expiryDate: typeof row.expiry_date === 'string' ? row.expiry_date : null,
    isVerified: row.is_verified === true,
    verifiedAt: typeof row.verified_at === 'string' ? row.verified_at : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    syncStatus: 'synced',
    localUri: null,
  };
}

function buildPreviewAttendanceRecords(): HrmsAttendanceRecord[] {
  return [
    {
      id: 'preview-attendance-today',
      logDate: toIsoDate(),
      checkInTime: new Date().toISOString(),
      checkOutTime: null,
      totalHours: null,
      status: 'present',
      syncStatus: 'local-preview',
      lastSelfieUri: null,
      geoFenceStatus: null,
      note: 'Preview attendance is stored locally in dev mode.',
    },
    {
      id: 'preview-attendance-yesterday',
      logDate: toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      checkInTime: new Date(Date.now() - 31 * 60 * 60 * 1000).toISOString(),
      checkOutTime: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
      totalHours: 9,
      status: 'present',
      syncStatus: 'local-preview',
      lastSelfieUri: null,
      geoFenceStatus: null,
      note: 'Preview attendance is stored locally in dev mode.',
    },
  ];
}

function buildPreviewLeaveTypes(): HrmsLeaveType[] {
  return FALLBACK_LEAVE_TYPES.map((type, index) => ({
    ...type,
    remainingDays: Math.max(type.yearlyQuota - index, 0),
    requiresApproval: true,
    description: null,
  }));
}

function buildPreviewLeaveApplications(): HrmsLeaveApplication[] {
  return [
    {
      id: 'preview-leave-approved',
      leaveTypeId: 'fallback-casual-leave',
      leaveTypeName: 'Casual Leave',
      leaveTypeCode: 'casual_leave',
      fromDate: '2026-04-12',
      toDate: '2026-04-13',
      numberOfDays: 2,
      reason: 'Family event in Pune.',
      status: 'approved',
      approvedAt: '2026-03-30T09:00:00.000Z',
      rejectionReason: null,
      createdAt: '2026-03-28T10:15:00.000Z',
      syncStatus: 'local-preview',
      note: 'Preview request only.',
    },
    {
      id: 'preview-leave-pending',
      leaveTypeId: 'fallback-sick-leave',
      leaveTypeName: 'Sick Leave',
      leaveTypeCode: 'sick_leave',
      fromDate: '2026-04-04',
      toDate: '2026-04-04',
      numberOfDays: 1,
      reason: 'Doctor-advised rest.',
      status: 'pending',
      approvedAt: null,
      rejectionReason: null,
      createdAt: '2026-04-01T08:10:00.000Z',
      syncStatus: 'local-preview',
      note: 'Preview request only.',
    },
  ];
}

function buildPreviewPayslips(): HrmsPayslip[] {
  return [
    {
      id: 'preview-payslip-march',
      payslipNumber: 'FPSL-2026-03-001',
      payPeriodFrom: '2026-03-01',
      payPeriodTo: '2026-03-31',
      workingDays: 31,
      presentDays: 29,
      absentDays: 0,
      leaveDays: 2,
      basicSalary: 24000,
      hra: 9600,
      specialAllowance: 4200,
      overtimeAmount: 1800,
      grossSalary: 39600,
      pfEmployee: 2880,
      esicEmployee: 0,
      professionalTax: 200,
      tds: 0,
      otherDeductions: 0,
      totalDeductions: 3080,
      netSalary: 36520,
      paymentStatus: 'paid',
      paymentDate: '2026-04-01',
      paymentReference: null,
      pdfUrl: null,
    },
    {
      id: 'preview-payslip-feb',
      payslipNumber: 'FPSL-2026-02-001',
      payPeriodFrom: '2026-02-01',
      payPeriodTo: '2026-02-28',
      workingDays: 28,
      presentDays: 27,
      absentDays: 0,
      leaveDays: 1,
      basicSalary: 24000,
      hra: 9600,
      specialAllowance: 4200,
      overtimeAmount: 950,
      grossSalary: 38750,
      pfEmployee: 2880,
      esicEmployee: 0,
      professionalTax: 200,
      tds: 0,
      otherDeductions: 0,
      totalDeductions: 3080,
      netSalary: 35670,
      paymentStatus: 'paid',
      paymentDate: '2026-03-01',
      paymentReference: null,
      pdfUrl: null,
    },
  ];
}

function buildPreviewDocuments(): HrmsDocument[] {
  return [
    {
      id: 'preview-document-aadhar',
      documentType: 'aadhar',
      documentNumber: 'XXXX-XXXX-2486',
      documentUrl: null,
      issueDate: null,
      expiryDate: null,
      isVerified: true,
      verifiedAt: '2026-03-20T08:00:00.000Z',
      notes: 'Identity proof verified by HR.',
      syncStatus: 'local-preview',
      localUri: null,
    },
    {
      id: 'preview-document-pan',
      documentType: 'pan',
      documentNumber: 'ABCDE1234F',
      documentUrl: null,
      issueDate: null,
      expiryDate: null,
      isVerified: true,
      verifiedAt: '2026-03-20T08:00:00.000Z',
      notes: 'Tax identity verified.',
      syncStatus: 'local-preview',
      localUri: null,
    },
    {
      id: 'preview-document-police',
      documentType: 'police_verification',
      documentNumber: null,
      documentUrl: null,
      issueDate: '2026-01-15',
      expiryDate: '2027-01-15',
      isVerified: false,
      verifiedAt: null,
      notes: 'Awaiting supervisor confirmation.',
      syncStatus: 'local-preview',
      localUri: null,
    },
  ];
}

async function loadAttendanceDrafts(employeeId: string | null) {
  return readStoredArray<HrmsAttendanceRecord>(
    getStorageKey(ATTENDANCE_DRAFT_KEY_PREFIX, employeeId),
  );
}

async function saveAttendanceDraft(
  employeeId: string | null,
  draft: HrmsAttendanceRecord,
) {
  const key = getStorageKey(ATTENDANCE_DRAFT_KEY_PREFIX, employeeId);
  const existing = await loadAttendanceDrafts(employeeId);
  const nextValue = existing.filter((item) => item.logDate !== draft.logDate);
  nextValue.unshift(draft);
  await writeStoredArray(key, nextValue);
}

async function loadLeaveDrafts(employeeId: string | null) {
  return readStoredArray<HrmsLeaveApplication>(getStorageKey(LEAVE_DRAFT_KEY_PREFIX, employeeId));
}

async function saveLeaveDraft(
  employeeId: string | null,
  draft: HrmsLeaveApplication,
) {
  const key = getStorageKey(LEAVE_DRAFT_KEY_PREFIX, employeeId);
  const existing = await loadLeaveDrafts(employeeId);
  const nextValue = existing.filter((item) => item.id !== draft.id);
  nextValue.unshift(draft);
  await writeStoredArray(key, nextValue);
}

async function saveLeaveDrafts(
  employeeId: string | null,
  drafts: HrmsLeaveApplication[],
) {
  await writeStoredArray(getStorageKey(LEAVE_DRAFT_KEY_PREFIX, employeeId), drafts);
}

async function loadDocumentDrafts(employeeId: string | null) {
  return readStoredArray<HrmsDocument>(getStorageKey(DOCUMENT_DRAFT_KEY_PREFIX, employeeId));
}

async function saveDocumentDraft(employeeId: string | null, draft: HrmsDocument) {
  const key = getStorageKey(DOCUMENT_DRAFT_KEY_PREFIX, employeeId);
  const existing = await loadDocumentDrafts(employeeId);
  const nextValue = existing.filter((item) => item.id !== draft.id);
  nextValue.unshift(draft);
  await writeStoredArray(key, nextValue);
}

function applyLeaveBalances(
  leaveTypes: HrmsLeaveType[],
  applications: HrmsLeaveApplication[],
) {
  const approvedUsage = new Map<string, number>();

  for (const request of applications) {
    if (request.status !== 'approved') {
      continue;
    }

    approvedUsage.set(
      request.leaveTypeId,
      (approvedUsage.get(request.leaveTypeId) ?? 0) + request.numberOfDays,
    );
  }

  return leaveTypes.map((type) => ({
    ...type,
    remainingDays: Math.max(type.yearlyQuota - (approvedUsage.get(type.id) ?? 0), 0),
  }));
}

async function fileUriToBlob(uri: string) {
  const response = await fetch(uri);
  return response.blob();
}

function inferFileExtension(uri: string, mimeType?: string) {
  const fromMime = mimeType?.split('/')[1]?.toLowerCase();

  if (fromMime) {
    return fromMime === 'jpeg' ? 'jpg' : fromMime;
  }

  const fromUri = uri.split('.').pop()?.toLowerCase();
  return fromUri || 'jpg';
}

function isFallbackLeaveTypeId(value: string) {
  return value.startsWith('fallback-');
}

async function resolveLeaveTypeId(options: {
  leaveTypeCode: string;
  leaveTypeId: string;
}) {
  if (options.leaveTypeId && !isFallbackLeaveTypeId(options.leaveTypeId)) {
    return options.leaveTypeId;
  }

  const { data, error } = await supabase
    .from('leave_types')
    .select('id')
    .eq('leave_type', options.leaveTypeCode)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return String(data.id);
}

async function syncPendingHrmsLeaveDrafts(profile: AppUserProfile | null) {
  const employeeId = profile?.employeeId ?? null;

  if (!employeeId || isPreviewProfile(profile)) {
    return loadLeaveDrafts(employeeId);
  }

  const drafts = await loadLeaveDrafts(employeeId);

  if (!drafts.some((draft) => draft.syncStatus === 'pending')) {
    return drafts;
  }

  const remainingDrafts: HrmsLeaveApplication[] = [];

  for (const draft of drafts) {
    if (draft.syncStatus !== 'pending') {
      remainingDrafts.push(draft);
      continue;
    }

    try {
      const resolvedLeaveTypeId = await resolveLeaveTypeId({
        leaveTypeCode: draft.leaveTypeCode,
        leaveTypeId: draft.leaveTypeId,
      });

      if (!resolvedLeaveTypeId) {
        remainingDrafts.push(draft);
        continue;
      }

      const { error } = await supabase.from('leave_applications').insert({
        employee_id: employeeId,
        leave_type_id: resolvedLeaveTypeId,
        from_date: draft.fromDate,
        to_date: draft.toDate,
        number_of_days: draft.numberOfDays,
        reason: draft.reason,
        status: 'pending',
      });

      if (error) {
        throw error;
      }
    } catch {
      remainingDrafts.push(draft);
    }
  }

  await saveLeaveDrafts(employeeId, remainingDrafts);
  return remainingDrafts;
}

export async function fetchHrmsAttendanceRecords(
  profile: AppUserProfile | null,
): Promise<HrmsAttendanceRecord[]> {
  const drafts = await loadAttendanceDrafts(profile?.employeeId ?? null);

  if (isPreviewProfile(profile)) {
    return mergeAttendance(buildPreviewAttendanceRecords(), drafts);
  }

  if (!profile?.employeeId) {
    return drafts;
  }

  try {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('id, log_date, check_in_time, check_out_time, total_hours, status')
      .eq('employee_id', profile.employeeId)
      .order('log_date', { ascending: false })
      .limit(14);

    if (error) {
      throw error;
    }

    const remoteRecords = (data ?? []).map((row) =>
      mapAttendanceRow(row as Record<string, unknown>),
    );

    return mergeAttendance(remoteRecords, drafts);
  } catch {
    return drafts;
  }
}

export async function recordHrmsAttendance(
  input: AttendanceActionInput,
): Promise<HrmsAttendanceRecord> {
  const geoFence = resolveGeoFence(input.profile, input.onboarding);

  if (!geoFence) {
    throw new Error('Complete geo-fence calibration before using HRMS attendance.');
  }

  const locationFix = await getCurrentLocationFix();
  const distanceMeters = calculateDistanceMeters(
    geoFence.latitude,
    geoFence.longitude,
    locationFix.coords.latitude,
    locationFix.coords.longitude,
  );

  const evaluatedGeoFence: HrmsGeoFenceStatus = {
    ...geoFence,
    distanceMeters,
    withinFence: distanceMeters <= geoFence.radiusMeters,
  };

  if (!evaluatedGeoFence.withinFence) {
    throw new Error(
      `You are ${distanceMeters}m away from ${geoFence.locationName}. Attendance is only allowed within ${geoFence.radiusMeters}m.`,
    );
  }

  const logDate = toIsoDate();
  const now = new Date().toISOString();
  const employeeId = input.profile?.employeeId ?? null;
  const existingRecords = await fetchHrmsAttendanceRecords(input.profile);
  const existingRecord = existingRecords.find((item) => item.logDate === logDate) ?? null;

  if (input.action === 'check-out' && !existingRecord?.checkInTime) {
    throw new Error('Check in first before recording the end of your shift.');
  }

  const checkInTime =
    input.action === 'check-in' ? now : existingRecord?.checkInTime ?? null;
  const checkOutTime =
    input.action === 'check-out' ? now : existingRecord?.checkOutTime ?? null;

  const draft: HrmsAttendanceRecord = {
    id: existingRecord?.id ?? createLocalId('attendance'),
    logDate,
    checkInTime,
    checkOutTime,
    totalHours: calculateHourDelta(checkInTime, checkOutTime),
    status: 'present',
    syncStatus: isPreviewProfile(input.profile) ? 'local-preview' : 'pending',
    lastSelfieUri: input.selfieUri,
    geoFenceStatus: evaluatedGeoFence,
    note: isPreviewProfile(input.profile)
      ? 'Preview attendance is stored locally in dev mode.'
      : 'Saved locally and queued for backend sync if direct attendance writes are blocked.',
  };

  if (isPreviewProfile(input.profile) || !employeeId) {
    await saveAttendanceDraft(employeeId, draft);
    return draft;
  }

  try {
    const { data: existingRow } = await supabase
      .from('attendance_logs')
      .select('id, check_in_time, check_out_time')
      .eq('employee_id', employeeId)
      .eq('log_date', logDate)
      .maybeSingle();

    const payload = {
      employee_id: employeeId,
      log_date: logDate,
      check_in_time:
        input.action === 'check-in'
          ? now
          : typeof existingRow?.check_in_time === 'string'
            ? existingRow.check_in_time
            : existingRecord?.checkInTime ?? null,
      check_out_time:
        input.action === 'check-out'
          ? now
          : typeof existingRow?.check_out_time === 'string'
            ? existingRow.check_out_time
            : existingRecord?.checkOutTime ?? null,
      check_in_location_id: geoFence.locationId,
      check_out_location_id: input.action === 'check-out' ? geoFence.locationId : null,
      total_hours: calculateHourDelta(checkInTime, checkOutTime),
      status: 'present',
    };

    const query = existingRow?.id
      ? supabase
          .from('attendance_logs')
          .update(payload)
          .eq('id', existingRow.id)
          .select('id, log_date, check_in_time, check_out_time, total_hours, status')
          .maybeSingle()
      : supabase
          .from('attendance_logs')
          .insert(payload)
          .select('id, log_date, check_in_time, check_out_time, total_hours, status')
          .maybeSingle();

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data) {
      const syncedRecord: HrmsAttendanceRecord = {
        ...mapAttendanceRow(data as Record<string, unknown>),
        lastSelfieUri: input.selfieUri,
        geoFenceStatus: evaluatedGeoFence,
        note: 'Attendance saved and selfie evidence retained on this device.',
      };

      await saveAttendanceDraft(employeeId, syncedRecord);
      return syncedRecord;
    }
  } catch {
    await saveAttendanceDraft(employeeId, draft);
    return draft;
  }

  await saveAttendanceDraft(employeeId, draft);
  return draft;
}

export async function fetchHrmsLeaveSnapshot(
  profile: AppUserProfile | null,
): Promise<{
  isPreview: boolean;
  applications: HrmsLeaveApplication[];
  leaveTypes: HrmsLeaveType[];
}> {
  const drafts = await syncPendingHrmsLeaveDrafts(profile);

  if (isPreviewProfile(profile)) {
    const previewApplications = mergeById(buildPreviewLeaveApplications(), drafts).sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt),
    );

    return {
      isPreview: true,
      leaveTypes: applyLeaveBalances(buildPreviewLeaveTypes(), previewApplications),
      applications: previewApplications,
    };
  }

  const remoteLeaveTypes: HrmsLeaveType[] = [...FALLBACK_LEAVE_TYPES].map((type) => ({
    ...type,
    remainingDays: type.yearlyQuota,
    requiresApproval: true,
    description: null,
  }));

  let remoteApplications: HrmsLeaveApplication[] = [];

  if (profile?.employeeId) {
    try {
      const { data } = await supabase
        .from('leave_types')
        .select(
          'id, leave_type, leave_name, yearly_quota, requires_approval, description',
        )
        .eq('is_active', true)
        .order('leave_name');

      if (data?.length) {
        remoteLeaveTypes.splice(
          0,
          remoteLeaveTypes.length,
          ...data.map((row) => mapLeaveTypeRow(row as Record<string, unknown>)),
        );
      }
    } catch {
      // Keep fallback quotas when table policies are not ready.
    }

    try {
      const { data } = await supabase
        .from('leave_applications')
        .select(
          'id, leave_type_id, from_date, to_date, number_of_days, reason, status, approved_at, rejection_reason, created_at, leave_types(id, leave_type, leave_name)',
        )
        .eq('employee_id', profile.employeeId)
        .order('created_at', { ascending: false });

      remoteApplications = (data ?? []).map((row) =>
        mapLeaveApplicationRow(row as Record<string, unknown>),
      );
    } catch {
      remoteApplications = [];
    }
  }

  const mergedApplications = mergeById(remoteApplications, drafts).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  return {
    isPreview: false,
    leaveTypes: applyLeaveBalances(remoteLeaveTypes, mergedApplications),
    applications: mergedApplications,
  };
}

export async function submitHrmsLeaveApplication(
  input: LeaveSubmissionInput,
): Promise<HrmsLeaveApplication> {
  const numberOfDays = calculateInclusiveLeaveDays(input.fromDate, input.toDate);

  if (numberOfDays <= 0) {
    throw new Error('Enter a valid leave date range.');
  }

  const draft: HrmsLeaveApplication = {
    id: createLocalId('leave'),
    leaveTypeId: input.leaveTypeId,
    leaveTypeName: input.leaveTypeName,
    leaveTypeCode: input.leaveTypeCode,
    fromDate: input.fromDate,
    toDate: input.toDate,
    numberOfDays,
    reason: input.reason.trim(),
    status: 'pending',
    approvedAt: null,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    syncStatus: isPreviewProfile(input.profile) ? 'local-preview' : 'pending',
    note: isPreviewProfile(input.profile)
      ? 'Preview request only.'
      : 'Stored locally until the backend accepts the request.',
  };

  if (!draft.reason) {
    throw new Error('Add a short reason so your supervisor can review the request.');
  }

  if (isPreviewProfile(input.profile) || !input.profile?.employeeId) {
    await saveLeaveDraft(input.profile?.employeeId ?? null, draft);
    return draft;
  }

  let draftForStorage = draft;

  try {
    const resolvedLeaveTypeId = await resolveLeaveTypeId({
      leaveTypeCode: input.leaveTypeCode,
      leaveTypeId: input.leaveTypeId,
    });

    if (!resolvedLeaveTypeId) {
      throw new Error('Leave type mapping is not available yet.');
    }

    draftForStorage = {
      ...draft,
      leaveTypeId: resolvedLeaveTypeId,
    };

    const { data, error } = await supabase
      .from('leave_applications')
      .insert({
        employee_id: input.profile.employeeId,
        leave_type_id: resolvedLeaveTypeId,
        from_date: input.fromDate,
        to_date: input.toDate,
        number_of_days: numberOfDays,
        reason: draft.reason,
        status: 'pending',
      })
      .select(
        'id, leave_type_id, from_date, to_date, number_of_days, reason, status, approved_at, rejection_reason, created_at',
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return {
        ...mapLeaveApplicationRow(data as Record<string, unknown>),
        leaveTypeId: resolvedLeaveTypeId,
        leaveTypeName: input.leaveTypeName,
        leaveTypeCode: input.leaveTypeCode,
      };
    }
  } catch {
    await saveLeaveDraft(input.profile.employeeId, draftForStorage);
    return draftForStorage;
  }

  await saveLeaveDraft(input.profile.employeeId, draftForStorage);
  return draftForStorage;
}

export async function fetchHrmsPayslips(profile: AppUserProfile | null): Promise<HrmsPayslip[]> {
  if (isPreviewProfile(profile)) {
    return buildPreviewPayslips();
  }

  if (!profile?.employeeId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('payslips')
      .select(
        'id, payslip_number, pay_period_from, pay_period_to, working_days, present_days, absent_days, leave_days, basic_salary, hra, special_allowance, overtime_amount, gross_salary, pf_employee, esic_employee, professional_tax, tds, other_deductions, total_deductions, net_salary, payment_status, payment_date, payment_reference',
      )
      .eq('employee_id', profile.employeeId)
      .order('pay_period_to', { ascending: false })
      .limit(12);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => mapPayslipRow(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function fetchHrmsDocuments(profile: AppUserProfile | null): Promise<HrmsDocument[]> {
  const drafts = await loadDocumentDrafts(profile?.employeeId ?? null);

  if (isPreviewProfile(profile)) {
    return mergeById(buildPreviewDocuments(), drafts);
  }

  if (!profile?.employeeId) {
    return drafts;
  }

  try {
    const { data, error } = await supabase
      .from('employee_documents')
      .select(
        'id, document_type, document_number, document_url, issue_date, expiry_date, is_verified, verified_at, notes',
      )
      .eq('employee_id', profile.employeeId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    const remoteDocuments = (data ?? []).map((row) =>
      mapDocumentRow(row as Record<string, unknown>),
    );

    return mergeById(remoteDocuments, drafts);
  } catch {
    return drafts;
  }
}

export async function uploadHrmsDocument(
  input: DocumentUploadInput,
): Promise<HrmsDocument> {
  const draft: HrmsDocument = {
    id: createLocalId('document'),
    documentType: input.documentType,
    documentNumber: input.documentNumber?.trim() || null,
    documentUrl: null,
    issueDate: input.issueDate?.trim() || null,
    expiryDate: null,
    isVerified: false,
    verifiedAt: null,
    notes: input.notes?.trim() || null,
    syncStatus: isPreviewProfile(input.profile) ? 'local-preview' : 'pending',
    localUri: input.sourceUri,
  };

  if (isPreviewProfile(input.profile) || !input.profile?.employeeId) {
    await saveDocumentDraft(input.profile?.employeeId ?? null, draft);
    return draft;
  }

  try {
    const extension = inferFileExtension(input.sourceUri, input.mimeType);
    const storagePath = `${input.profile.employeeId}/${input.documentType}-${Date.now()}.${extension}`;
    const fileBody = await fileUriToBlob(input.sourceUri);

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(storagePath, fileBody, {
        contentType: input.mimeType ?? `image/${extension}`,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data, error } = await supabase
      .from('employee_documents')
      .insert({
        employee_id: input.profile.employeeId,
        document_type: input.documentType,
        document_number: draft.documentNumber,
        document_url: storagePath,
        issue_date: draft.issueDate,
        notes: draft.notes,
      })
      .select(
        'id, document_type, document_number, document_url, issue_date, expiry_date, is_verified, verified_at, notes',
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return mapDocumentRow(data as Record<string, unknown>);
    }
  } catch {
    await saveDocumentDraft(input.profile.employeeId, draft);
    return draft;
  }

  await saveDocumentDraft(input.profile.employeeId, draft);
  return draft;
}

export async function fetchHrmsDashboardData(
  profile: AppUserProfile | null,
): Promise<HrmsDashboardData> {
  const [attendance, leaveSnapshot, payslips, documents] = await Promise.all([
    fetchHrmsAttendanceRecords(profile),
    fetchHrmsLeaveSnapshot(profile),
    fetchHrmsPayslips(profile),
    fetchHrmsDocuments(profile),
  ]);

  return {
    isPreview: leaveSnapshot.isPreview || isPreviewProfile(profile),
    attendance,
    leaveTypes: leaveSnapshot.leaveTypes,
    leaveApplications: leaveSnapshot.applications,
    payslips,
    documents,
  };
}

export function getHrmsDocumentLabel(documentType: HrmsDocumentType) {
  switch (documentType) {
    case 'aadhar':
      return 'Aadhar';
    case 'pan':
      return 'PAN';
    case 'voter_id':
      return 'Voter ID';
    case 'passport':
      return 'Passport';
    case 'psara':
      return 'PSARA Certificate';
    case 'police_verification':
      return 'Police Verification';
    default:
      return 'Other Document';
  }
}
