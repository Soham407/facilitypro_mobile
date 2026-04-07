import { supabase } from './supabase';
import type { AppUserProfile } from '../types/app';
import type {
  GuardEmergencyContact,
  GuardChecklistItem,
  GuardLocationSnapshot,
  GuardSosType,
  GuardVisitorType,
  GuardVisitorEntry,
} from '../types/guard';
import type {
  OversightAlertRecord,
  OversightAttendanceRecord,
  OversightGuardRecord,
  OversightMaterialDeliveryRecord,
  OversightMaterialIssueType,
  OversightSeverity,
  OversightTicketRecord,
  OversightTicketStatus,
  OversightTicketType,
  OversightVisitorGateStat,
} from '../types/oversight';


const VISITOR_MEDIA_BUCKET = 'visitor-photos';
const GUARD_SECURE_MEDIA_BUCKET = 'guard-secure-media';
const OVERSIGHT_TICKET_EVIDENCE_BUCKET = 'oversight-ticket-evidence';

function createUploadName(prefix: string, uri: string, contentType: string) {
  const safePrefix = prefix.replace(/^\/+|\/+$/g, '');
  const extensionFromType = contentType.split('/')[1]?.toLowerCase();
  const extensionFromUri = uri.split('.').pop()?.toLowerCase();
  const extension = extensionFromType || extensionFromUri || 'jpg';

  return `${safePrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parseStorageRef(value: string | null) {
  if (!value) {
    return null;
  }

  if (isHttpUrl(value)) {
    return null;
  }

  const normalized = value.replace(/^storage:\/\//, '');
  const slashIndex = normalized.indexOf('/');

  if (slashIndex <= 0) {
    return {
      bucket: VISITOR_MEDIA_BUCKET,
      path: normalized,
    };
  }

  return {
    bucket: normalized.slice(0, slashIndex),
    path: normalized.slice(slashIndex + 1),
  };
}

async function createSignedMediaUrl(value: string | null) {
  if (!value) {
    return null;
  }

  if (isHttpUrl(value)) {
    return value;
  }

  const ref = parseStorageRef(value);

  if (!ref) {
    return null;
  }

  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

async function uploadPrivateImage(options: {
  bucket: string;
  prefix: string;
  uri: string | null;
}) {
  if (!options.uri) {
    return null;
  }

  const response = await fetch(options.uri);
  const blob = await response.blob();
  const path = createUploadName(options.prefix, options.uri, blob.type || 'image/jpeg');

  const { error } = await supabase.storage.from(options.bucket).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return `${options.bucket}/${path}`;
}

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

function normalizeApprovalStatus(options: {
  approvalStatus?: string | null;
  approvedByResident?: boolean | null;
  approvalDeadlineAt?: string | null;
  exitTime?: string | null;
}) {
  if (options.exitTime) {
    return 'checked_out' as const;
  }

  if (options.approvalStatus) {
    if (options.approvalStatus === 'approved' || options.approvalStatus === 'denied') {
      return options.approvalStatus;
    }

    if (options.approvalStatus === 'timed_out' || options.approvalStatus === 'timeout') {
      return 'timed_out';
    }
  }

  if (options.approvedByResident === true) {
    return 'approved' as const;
  }

  if (options.approvedByResident === false) {
    return 'denied' as const;
  }

  if (
    options.approvalDeadlineAt &&
    new Date(options.approvalDeadlineAt).getTime() < Date.now()
  ) {
    return 'timed_out' as const;
  }

  return 'pending' as const;
}

function normalizeAlertType(value: string | null | undefined) {
  if (value === 'panic' || value === 'inactivity' || value === 'geo_fence_breach') {
    return value;
  }

  return 'inactivity';
}

function normalizeAlertStatus(value: string | null | undefined) {
  if (value === 'active' || value === 'acknowledged' || value === 'resolved') {
    return value;
  }

  return 'active';
}

function normalizeGuardStatus(value: string | null | undefined) {
  if (value === 'on_duty' || value === 'off_duty' || value === 'offline' || value === 'breach') {
    return value;
  }

  return 'offline';
}

function normalizeChecklistInputType(value: string | null | undefined) {
  return value === 'numeric' ? 'numeric' : 'yes_no';
}

function normalizeChecklistOverrideStatus(value: string | null | undefined) {
  if (value === 'approved' || value === 'resubmitted') {
    return value;
  }

  return 'none';
}

function normalizeVisitorType(value: string | null | undefined): GuardVisitorType {
  return value === 'delivery' ? 'delivery' : 'guest';
}

function normalizeOversightSeverity(value: string | null | undefined): OversightSeverity {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }

  return 'medium';
}

function normalizeOversightTicketStatus(value: string | null | undefined): OversightTicketStatus {
  if (value === 'open' || value === 'acknowledged' || value === 'closed') {
    return value;
  }

  return 'open';
}

function normalizeOversightTicketType(value: string | null | undefined): OversightTicketType {
  if (value === 'return') {
    return 'return';
  }

  if (value === 'material') {
    return 'material';
  }

  return 'behavior';
}

function normalizeMaterialIssueType(
  value: string | null | undefined,
): OversightMaterialIssueType | null {
  if (value === 'quality' || value === 'quantity') {
    return value;
  }

  return null;
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeEvidenceValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

export function isPreviewProfile(profile: AppUserProfile | null) {
  return profile?.userId.startsWith('dev-preview-') ?? false;
}

export interface ResidentDestination {
  flatId: string;
  flatLabel: string;
  residentId: string | null;
  residentName: string | null;
  residentPhone: string | null;
}

export async function searchResidentDestinations(query: string) {
  const { data, error } = await supabase.rpc('search_resident_destinations', {
    p_search: query.trim(),
  });

  throwIfError(error);

  return ((data ?? []) as Array<Record<string, string | null>>).map((item) => ({
    flatId: item.flat_id ?? '',
    flatLabel: item.flat_label ?? 'Unknown flat',
    residentId: item.resident_id,
    residentName: item.resident_name,
    residentPhone: item.resident_phone,
  })) satisfies ResidentDestination[];
}

export async function createGuardVisitorEntry(input: {
  visitorName: string;
  phone: string;
  purpose: string;
  destination: string;
  flatId: string | null;
  vehicleNumber: string;
  photoUri: string | null;
  isFrequentVisitor: boolean;
  visitorType?: GuardVisitorType;
}) {
  const visitorType = input.visitorType ?? 'guest';
  const photoPath = await uploadPrivateImage({
    bucket: VISITOR_MEDIA_BUCKET,
    prefix: `gate-entry/${input.flatId ?? visitorType}`,
    uri: input.photoUri,
  });

  const purpose =
    visitorType === 'delivery' && input.destination.trim()
      ? `${input.purpose.trim()} | Drop point: ${input.destination.trim()}`
      : input.purpose.trim();

  const { data, error } = await supabase.rpc('create_mobile_visitor', {
    p_flat_id: input.flatId,
    p_is_frequent_visitor: input.isFrequentVisitor,
    p_phone: input.phone,
    p_photo_url: photoPath,
    p_purpose: purpose,
    p_vehicle_number: input.vehicleNumber || null,
    p_visitor_name: input.visitorName,
    p_visitor_type: visitorType,
  });

  throwIfError(error);
  return data as {
    success?: boolean;
    visitor_id?: string;
    visitor?: Record<string, unknown>;
    error?: string;
  } | null;
}

export async function fetchGuardVisitors(includeCheckedOut = true) {
  const { data, error } = await supabase.rpc('get_guard_visitors', {
    p_include_checked_out: includeCheckedOut,
  });

  throwIfError(error);

  const rows = (data ?? []) as Array<Record<string, string | boolean | null>>;

  return Promise.all(
    rows.map(async (row): Promise<GuardVisitorEntry> => ({
      id: String(row.id),
      backendId: String(row.id),
      visitorType: normalizeVisitorType(row.visitor_type ? String(row.visitor_type) : null),
      name: row.visitor_name ? String(row.visitor_name) : 'Visitor',
      phone: row.phone ? String(row.phone) : '',
      purpose: row.purpose ? String(row.purpose) : 'General visit',
      destination: row.flat_label
        ? String(row.flat_label)
        : row.entry_location_name
          ? String(row.entry_location_name)
          : row.resident_name
            ? String(row.resident_name)
            : 'Destination pending',
      flatId: row.flat_id ? String(row.flat_id) : null,
      residentId: row.resident_id ? String(row.resident_id) : null,
      entryLocationName: row.entry_location_name ? String(row.entry_location_name) : null,
      vehicleNumber: row.vehicle_number ? String(row.vehicle_number) : '',
      photoUri: null,
      photoUrl: await createSignedMediaUrl(row.photo_url ? String(row.photo_url) : null),
      recordedAt: row.entry_time ? String(row.entry_time) : new Date().toISOString(),
      status: row.exit_time ? 'checked_out' : 'inside',
      frequentVisitor: Boolean(row.is_frequent_visitor),
      approvalStatus: normalizeApprovalStatus({
        approvalDeadlineAt: row.approval_deadline_at ? String(row.approval_deadline_at) : null,
        approvalStatus: row.approval_status ? String(row.approval_status) : null,
        approvedByResident:
          typeof row.approved_by_resident === 'boolean' ? row.approved_by_resident : null,
        exitTime: row.exit_time ? String(row.exit_time) : null,
      }),
      approvalDeadlineAt: row.approval_deadline_at ? String(row.approval_deadline_at) : null,
      decisionAt: row.decision_at ? String(row.decision_at) : null,
    })),
  );
}

export async function checkoutGuardVisitor(visitorId: string, userId: string) {
  const { data, error } = await supabase.rpc('checkout_visitor', {
    p_user_id: userId,
    p_visitor_id: visitorId,
  });

  throwIfError(error);
  return data as { success?: boolean; error?: string } | null;
}

export async function startGuardPanicAlert(input: {
  alertType: GuardSosType;
  note: string;
  location: GuardLocationSnapshot | null;
  photoUri: string | null;
}) {
  const photoPath = await uploadPrivateImage({
    bucket: GUARD_SECURE_MEDIA_BUCKET,
    prefix: `panic-alerts/${new Date().toISOString().slice(0, 10)}`,
    uri: input.photoUri,
  });

  const { data, error } = await supabase.rpc('start_mobile_panic_alert', {
    p_alert_type: input.alertType,
    p_description: input.note || null,
    p_latitude: input.location?.latitude ?? null,
    p_longitude: input.location?.longitude ?? null,
    p_metadata: input.location
      ? {
          captured_at: input.location.capturedAt,
          distance_from_assigned_site: input.location.distanceFromAssignedSite,
          within_geo_fence: input.location.withinGeoFence,
        }
      : {},
    p_photo_url: photoPath,
  });

  throwIfError(error);
  return data as { success?: boolean; alert_id?: string; error?: string } | null;
}


export async function fetchOversightLiveGuards() {
  const { data, error } = await supabase.rpc('get_oversight_live_guards');

  throwIfError(error);

  return ((data ?? []) as Array<Record<string, string | number | null>>).map((row) => ({
    id: String(row.id),
    guardName: row.guard_name ? String(row.guard_name) : 'Guard',
    guardCode: row.guard_code ? String(row.guard_code) : 'N/A',
    assignedLocationName: row.assigned_location_name ? String(row.assigned_location_name) : 'Location pending',
    status: normalizeGuardStatus(row.status ? String(row.status) : null),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : new Date().toISOString(),
    checklistCompleted: typeof row.checklist_completed === 'number' ? row.checklist_completed : 0,
    checklistTotal: typeof row.checklist_total === 'number' ? row.checklist_total : 0,
    currentShiftLabel: row.current_shift_label ? String(row.current_shift_label) : 'Current shift',
    latitude: typeof row.latitude === 'number' ? row.latitude : null,
    longitude: typeof row.longitude === 'number' ? row.longitude : null,
    visitorsHandledToday:
      typeof row.visitors_handled_today === 'number' ? row.visitors_handled_today : 0,
  })) satisfies OversightGuardRecord[];
}

export async function fetchOversightAlertFeed() {
  const { data, error } = await supabase.rpc('get_oversight_alert_feed');

  throwIfError(error);

  return ((data ?? []) as Array<Record<string, string | null>>).map((row) => ({
    id: String(row.id),
    guardId: row.guard_id ? String(row.guard_id) : '',
    guardName: row.guard_name ? String(row.guard_name) : 'Guard',
    locationName: row.location_name ? String(row.location_name) : 'Location pending',
    alertType: normalizeAlertType(row.alert_type ? String(row.alert_type) : null),
    status: normalizeAlertStatus(row.status ? String(row.status) : null),
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    note: row.note ? String(row.note) : 'No notes attached.',
  })) satisfies OversightAlertRecord[];
}

export async function fetchOversightVisitorStats() {
  const { data, error } = await supabase.rpc('get_oversight_visitor_stats');

  throwIfError(error);

  return ((data ?? []) as Array<Record<string, string | number | null>>).map((row) => ({
    id: String(row.id),
    gateName: row.gate_name ? String(row.gate_name) : 'Gate',
    visitorsToday: typeof row.visitors_today === 'number' ? row.visitors_today : 0,
    visitorsThisWeek: typeof row.visitors_this_week === 'number' ? row.visitors_this_week : 0,
    pendingApprovals: typeof row.pending_approvals === 'number' ? row.pending_approvals : 0,
    deliveryVehicles: typeof row.delivery_vehicles === 'number' ? row.delivery_vehicles : 0,
  })) satisfies OversightVisitorGateStat[];
}

export async function acknowledgeMobilePanicAlert(alertId: string, notes?: string) {
  const { data, error } = await supabase.rpc('acknowledge_mobile_panic_alert', {
    p_alert_id: alertId,
    p_notes: notes ?? null,
  });

  throwIfError(error);
  return data as { success?: boolean; error?: string } | null;
}

export async function resolveMobilePanicAlert(alertId: string, notes?: string) {
  const { data, error } = await supabase.rpc('resolve_mobile_panic_alert', {
    p_alert_id: alertId,
    p_notes: notes ?? null,
  });

  throwIfError(error);
  return data as { success?: boolean; error?: string } | null;
}

export async function fetchGuardChecklistItems() {
  const { data, error } = await supabase.rpc('get_guard_checklist_items');

  throwIfError(error);

  const rows = (data ?? []) as Array<Record<string, string | boolean | number | null>>;

  return Promise.all(
    rows.map(async (row): Promise<GuardChecklistItem> => ({
      id: String(row.master_item_id),
      masterItemId: row.master_item_id ? String(row.master_item_id) : null,
      checklistId: row.checklist_id ? String(row.checklist_id) : null,
      title: row.title ? String(row.title) : 'Checklist item',
      description: row.description ? String(row.description) : '',
      requiredEvidence: Boolean(row.required_evidence),
      inputType: normalizeChecklistInputType(row.input_type ? String(row.input_type) : null),
      numericValue:
        row.input_type === 'numeric' && row.response_value ? String(row.response_value) : '',
      numericUnitLabel: row.numeric_unit_label ? String(row.numeric_unit_label) : null,
      numericMinValue:
        typeof row.numeric_min_value === 'number' ? row.numeric_min_value : null,
      numericMaxValue:
        typeof row.numeric_max_value === 'number' ? row.numeric_max_value : null,
      requiresSupervisorOverride: Boolean(row.requires_supervisor_override),
      responseValue: row.response_value ? String(row.response_value) : null,
      status: row.status === 'completed' ? 'completed' : 'pending',
      completedAt: row.submitted_at ? String(row.submitted_at) : null,
      evidenceUri: await createSignedMediaUrl(row.evidence_url ? String(row.evidence_url) : null),
      overrideStatus: normalizeChecklistOverrideStatus(
        row.override_status ? String(row.override_status) : null,
      ),
      overrideReason: row.override_reason ? String(row.override_reason) : null,
      overriddenAt: row.overridden_at ? String(row.overridden_at) : null,
      overriddenByName: row.overridden_by_name ? String(row.overridden_by_name) : null,
    })),
  );
}

export async function reopenGuardChecklist(
  guardId: string,
  reason: string,
  checklistId?: string | null,
) {
  const { data, error } = await supabase.rpc('reopen_guard_checklist', {
    p_checklist_id: checklistId ?? null,
    p_guard_id: guardId,
    p_reason: reason,
  });

  throwIfError(error);
  return data as { success?: boolean; error?: string } | null;
}

export async function submitGuardChecklist(items: GuardChecklistItem[]) {
  if (!items.length) {
    throw new Error('Checklist items are required');
  }

  const checklistId = items.find((item) => item.checklistId)?.checklistId;

  if (!checklistId) {
    throw new Error('Checklist ID is missing for the current checklist');
  }

  const responses = await Promise.all(
    items.map(async (item) => ({
      master_item_id: item.masterItemId,
      value:
        item.inputType === 'numeric'
          ? item.numericValue
          : item.responseValue ?? (item.status === 'completed' ? 'yes' : 'no'),
      evidence_url:
        item.evidenceUri && !isHttpUrl(item.evidenceUri)
          ? await uploadPrivateImage({
              bucket: GUARD_SECURE_MEDIA_BUCKET,
              prefix: `checklist-evidence/${checklistId}`,
              uri: item.evidenceUri,
            })
          : item.evidenceUri,
    })),
  );

  const { data, error } = await supabase.rpc('submit_mobile_guard_checklist', {
    p_checklist_id: checklistId,
    p_is_complete: true,
    p_responses: responses,
  });

  throwIfError(error);
  return data as { success?: boolean; error?: string } | null;
}

export async function attachPanicAlertEvidence(alertId: string, photoUri: string) {
  const photoPath = await uploadPrivateImage({
    bucket: GUARD_SECURE_MEDIA_BUCKET,
    prefix: `panic-alerts/${new Date().toISOString().slice(0, 10)}`,
    uri: photoUri,
  });

  const { data, error } = await supabase
    .from('sos_events')
    .update({ photo_url: photoPath })
    .eq('id', alertId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

export async function streamPanicAlertLocation(
  alertId: string,
  location: GuardLocationSnapshot,
): Promise<void> {
  try {
    await supabase.rpc('update_panic_alert_location', {
      p_alert_id: alertId,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_captured_at: location.capturedAt,
    });
  } catch {
    // Keep streaming best-effort and avoid interrupting the guard workflow.
  }
}

export async function fetchPanicAlertStatus(
  alertId: string,
): Promise<'active' | 'acknowledged' | 'resolved' | null> {
  try {
    const { data, error } = await supabase.rpc('get_panic_alert_status', {
      p_alert_id: alertId,
    });

    if (error || !data) {
      return null;
    }

    if (data === 'active' || data === 'acknowledged' || data === 'resolved') {
      return data;
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchGuardEmergencyContacts(): Promise<GuardEmergencyContact[]> {
  try {
    const { data, error } = await supabase.rpc('get_guard_emergency_contacts');

    if (error) {
      return [];
    }

    return ((data ?? []) as Array<Record<string, string | boolean | null>>).map((row) => ({
      id: String(row.id ?? row.contact_id ?? `${row.label ?? 'contact'}-${row.phone ?? ''}`),
      label: row.label ? String(row.label) : 'Contact',
      role: row.role ? String(row.role) : '',
      phone: row.phone ? String(row.phone) : '',
      description: row.description ? String(row.description) : '',
      primary: Boolean(row.is_primary ?? row.primary),
    }));
  } catch {
    return [];
  }
}

export async function fetchOversightAttendanceLog() {
  const { data, error } = await supabase.rpc('get_oversight_attendance_log');

  throwIfError(error);

  return ((data ?? []) as Array<Record<string, string | null>>).map((row) => ({
    id: String(row.id),
    employeeName: row.employee_name ? String(row.employee_name) : 'Employee',
    roleLabel: row.role_label ? String(row.role_label) : 'Staff',
    locationName: row.location_name ? String(row.location_name) : 'Assigned site',
    checkInAt: row.check_in_at ? String(row.check_in_at) : null,
    checkOutAt: row.check_out_at ? String(row.check_out_at) : null,
    geoStatus:
      row.geo_status === 'verified' || row.geo_status === 'outside_fence'
        ? row.geo_status
        : 'missing',
    status:
      row.status === 'on_shift' ||
      row.status === 'late' ||
      row.status === 'completed' ||
      row.status === 'absent'
        ? row.status
        : 'absent',
  })) satisfies OversightAttendanceRecord[];
}

async function uploadOversightEvidenceUris(uris: string[]) {
  return Promise.all(
    uris.map(async (uri) => {
      if (
        isHttpUrl(uri) ||
        uri.startsWith('storage://') ||
        /^[a-z0-9-]+\/.+/i.test(uri)
      ) {
        return uri;
      }

      return uploadPrivateImage({
        bucket: OVERSIGHT_TICKET_EVIDENCE_BUCKET,
        prefix: `oversight/${new Date().toISOString().slice(0, 10)}`,
        uri,
      });
    }),
  );
}

export async function fetchOversightTickets() {
  const { data, error } = await supabase.rpc('get_mobile_oversight_tickets');

  throwIfError(error);

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  return Promise.all(
    rows.map(async (row): Promise<OversightTicketRecord> => {
      const evidenceUris = await Promise.all(
        normalizeEvidenceValues(row.evidence_urls).map(async (uri) => {
          const signedUrl = await createSignedMediaUrl(uri);
          return signedUrl ?? uri;
        }),
      );

      return {
        id: String(row.id),
        ticketNumber: row.ticket_number ? String(row.ticket_number) : null,
        ticketType: normalizeOversightTicketType(
          row.ticket_type ? String(row.ticket_type) : null,
        ),
        materialIssueType: normalizeMaterialIssueType(
          row.material_issue_type ? String(row.material_issue_type) : null,
        ),
        subjectName: row.subject_name ? String(row.subject_name) : 'Ticket',
        category: row.category ? String(row.category) : 'General',
        severity: normalizeOversightSeverity(row.severity ? String(row.severity) : null),
        status: normalizeOversightTicketStatus(row.status ? String(row.status) : null),
        createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
        note: row.note ? String(row.note) : '',
        evidenceUris,
        batchNumber: row.batch_number ? String(row.batch_number) : null,
        orderedQuantity: normalizeNumber(row.ordered_quantity),
        receivedQuantity: normalizeNumber(row.received_quantity),
        shortageQuantity: normalizeNumber(row.shortage_quantity),
        returnQuantity: normalizeNumber(row.return_quantity),
        locationName: row.location_name ? String(row.location_name) : null,
        sourceVisitorId: row.source_visitor_id ? String(row.source_visitor_id) : null,
        parentTicketId: row.parent_ticket_id ? String(row.parent_ticket_id) : null,
        inspectionOutcome:
          row.inspection_outcome === 'approved' || row.inspection_outcome === 'rejected'
            ? row.inspection_outcome
            : null,
      };
    }),
  );
}

export async function fetchPendingMaterialDeliveryEvents() {
  const { data, error } = await supabase.rpc('get_pending_material_delivery_events');

  throwIfError(error);

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  return Promise.all(
    rows.map(async (row): Promise<OversightMaterialDeliveryRecord> => ({
      id: String(row.id),
      visitorName: row.visitor_name ? String(row.visitor_name) : 'Delivery',
      purpose: row.purpose ? String(row.purpose) : 'Delivery inspection pending',
      vehicleNumber: row.vehicle_number ? String(row.vehicle_number) : '',
      photoUrl: await createSignedMediaUrl(row.photo_url ? String(row.photo_url) : null),
      gateName: row.gate_name ? String(row.gate_name) : 'Gate',
      entryTime: row.entry_time ? String(row.entry_time) : new Date().toISOString(),
    })),
  );
}

export async function createBehaviorTicket(input: {
  subjectName: string;
  category: string;
  severity: OversightSeverity;
  note: string;
  evidenceUris: string[];
  locationName?: string | null;
  linkedEmployeeId?: string | null;
}) {
  const evidenceUrls = await uploadOversightEvidenceUris(input.evidenceUris);

  const { data, error } = await supabase.rpc('create_behavior_ticket', {
    p_category: input.category,
    p_evidence_urls: evidenceUrls,
    p_linked_employee_id: input.linkedEmployeeId ?? null,
    p_location_name: input.locationName ?? null,
    p_note: input.note,
    p_severity: input.severity,
    p_subject_name: input.subjectName,
  });

  throwIfError(error);
  return data as {
    success?: boolean;
    ticket_id?: string;
    ticket_number?: string;
    error?: string;
  } | null;
}

export async function createMaterialTicket(input: {
  subjectName: string;
  category: string;
  materialIssueType: OversightMaterialIssueType;
  severity: OversightSeverity;
  note: string;
  evidenceUris: string[];
  batchNumber?: string | null;
  orderedQuantity?: number | null;
  receivedQuantity?: number | null;
  returnQuantity?: number | null;
  locationName?: string | null;
  sourceVisitorId?: string | null;
  inspectionOutcome?: 'approved' | 'rejected' | null;
}) {
  const evidenceUrls = await uploadOversightEvidenceUris(input.evidenceUris);

  const { data, error } = await supabase.rpc('create_material_ticket', {
    p_batch_number: input.batchNumber ?? null,
    p_category: input.category,
    p_evidence_urls: evidenceUrls,
    p_inspection_outcome: input.inspectionOutcome ?? null,
    p_location_name: input.locationName ?? null,
    p_material_issue_type: input.materialIssueType,
    p_note: input.note,
    p_ordered_quantity: input.orderedQuantity ?? null,
    p_received_quantity: input.receivedQuantity ?? null,
    p_return_quantity: input.returnQuantity ?? null,
    p_severity: input.severity,
    p_source_visitor_id: input.sourceVisitorId ?? null,
    p_subject_name: input.subjectName,
  });

  throwIfError(error);
  return data as {
    success?: boolean;
    ticket_id?: string;
    ticket_number?: string;
    return_ticket_id?: string;
    return_ticket_number?: string;
    error?: string;
  } | null;
}

export async function updateOversightTicketStatus(
  ticketId: string,
  status: OversightTicketStatus,
  resolutionNotes?: string,
) {
  const { data, error } = await supabase.rpc('update_oversight_ticket_status', {
    p_resolution_notes: resolutionNotes ?? null,
    p_status: status,
    p_ticket_id: ticketId,
  });

  throwIfError(error);
  return data as {
    success?: boolean;
    ticket_id?: string;
    ticket_number?: string;
    status?: OversightTicketStatus;
    error?: string;
  } | null;
}

export async function flagHrmsGeoFenceBreach(input: {
  employeeId: string;
  location: GuardLocationSnapshot;
}) {
  const { data, error } = await supabase.rpc('flag_employee_geo_breach', {
    p_employee_id: input.employeeId,
    p_latitude: input.location.latitude,
    p_longitude: input.location.longitude,
    p_captured_at: input.location.capturedAt,
    p_distance: input.location.distanceFromAssignedSite,
  });

  if (error) {
    throw error;
  }

  return data as { success?: boolean; error?: string } | null;
}

