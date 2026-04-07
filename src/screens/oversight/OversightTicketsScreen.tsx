import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Camera, PackageSearch, ShieldAlert } from 'lucide-react-native';

import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  createBehaviorTicket,
  createMaterialTicket,
  fetchOversightTickets,
  fetchPendingMaterialDeliveryEvents,
  isPreviewProfile,
  updateOversightTicketStatus,
} from '../../lib/mobileBackend';
import { capturePhoto } from '../../lib/media';
import type { OversightTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useOversightStore } from '../../store/useOversightStore';
import type {
  OversightMaterialIssueType,
  OversightSeverity,
  OversightTicketRecord,
  OversightTicketStatus,
  OversightTicketType,
} from '../../types/oversight';

type OversightTicketsScreenProps = BottomTabScreenProps<
  OversightTabParamList,
  'OversightTickets'
>;

const TICKET_TYPE_OPTIONS: Array<{ label: string; value: Extract<OversightTicketType, 'behavior' | 'material'> }> = [
  { label: 'Behavior', value: 'behavior' },
  { label: 'Material', value: 'material' },
];

const MATERIAL_ISSUE_OPTIONS: Array<{ label: string; value: OversightMaterialIssueType }> = [
  { label: 'Quality', value: 'quality' },
  { label: 'Quantity', value: 'quantity' },
];

const SEVERITY_OPTIONS: Array<{ label: string; value: OversightSeverity }> = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const INSPECTION_OPTIONS: Array<{
  label: string;
  value: 'pending' | 'approved' | 'rejected';
}> = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approve', value: 'approved' },
  { label: 'Reject', value: 'rejected' },
];

function formatValue(value: string) {
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function parseNumericValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function getStatusTone(status: OversightTicketRecord['status']) {
  if (status === 'open') {
    return 'danger';
  }

  if (status === 'acknowledged') {
    return 'warning';
  }

  return 'success';
}

function getSeverityTone(severity: OversightTicketRecord['severity']) {
  if (severity === 'critical' || severity === 'high') {
    return 'danger';
  }

  if (severity === 'medium') {
    return 'warning';
  }

  return 'info';
}

function getTypeLabel(ticket: OversightTicketRecord) {
  if (ticket.ticketType === 'material') {
    return ticket.materialIssueType ? `material ${ticket.materialIssueType}` : 'material';
  }

  return ticket.ticketType;
}

export function OversightTicketsScreen(_props: OversightTicketsScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const previewMode = isPreviewProfile(profile);
  const queryClient = useQueryClient();
  const previewTickets = useOversightStore((state) => state.tickets);
  const createPreviewTicket = useOversightStore((state) => state.createTicket);
  const setPreviewTicketStatus = useOversightStore((state) => state.setTicketStatus);

  const [ticketType, setTicketType] = useState<Extract<OversightTicketType, 'behavior' | 'material'>>(
    'behavior',
  );
  const [materialIssueType, setMaterialIssueType] = useState<OversightMaterialIssueType>('quality');
  const [severity, setSeverity] = useState<OversightSeverity>('medium');
  const [subjectName, setSubjectName] = useState('');
  const [category, setCategory] = useState('');
  const [locationName, setLocationName] = useState('');
  const [note, setNote] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [orderedQuantity, setOrderedQuantity] = useState('');
  const [receivedQuantity, setReceivedQuantity] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('');
  const [inspectionOutcome, setInspectionOutcome] = useState<'pending' | 'approved' | 'rejected'>(
    'pending',
  );
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [sourceVisitorId, setSourceVisitorId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ['oversight', 'tickets', profile?.userId],
    queryFn: fetchOversightTickets,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 30000,
  });

  const pendingDeliveriesQuery = useQuery({
    queryKey: ['oversight', 'pending-deliveries', profile?.userId],
    queryFn: fetchPendingMaterialDeliveryEvents,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 30000,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async (input: {
      ticketId: string;
      status: OversightTicketStatus;
      resolutionNotes?: string;
    }) => updateOversightTicketStatus(input.ticketId, input.status, input.resolutionNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['oversight', 'tickets', profile?.userId],
      });
    },
  });

  const tickets = previewMode ? previewTickets : ticketsQuery.data ?? [];
  const pendingDeliveries = previewMode ? [] : pendingDeliveriesQuery.data ?? [];

  const sortedTickets = useMemo(
    () =>
      [...tickets].sort((left, right) => {
        const score = { open: 0, acknowledged: 1, closed: 2 };
        const statusDelta = score[left.status] - score[right.status];

        if (statusDelta !== 0) {
          return statusDelta;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [tickets],
  );

  const showMaterialFields = ticketType === 'material';
  const selectedDelivery = pendingDeliveries.find((delivery) => delivery.id === sourceVisitorId) ?? null;

  const resetForm = () => {
    setTicketType('behavior');
    setMaterialIssueType('quality');
    setSeverity('medium');
    setSubjectName('');
    setCategory('');
    setLocationName('');
    setNote('');
    setBatchNumber('');
    setOrderedQuantity('');
    setReceivedQuantity('');
    setReturnQuantity('');
    setInspectionOutcome('pending');
    setEvidenceUris([]);
    setSourceVisitorId(null);
  };

  const handleCaptureEvidence = async () => {
    setMessage(null);

    try {
      const photo = await capturePhoto({
        cameraType: 'back',
        aspect: [4, 3],
      });

      if (!photo) {
        setMessage('Evidence capture was cancelled.');
        return;
      }

      setEvidenceUris((current) => [...current, photo.uri]);
      setMessage('Evidence added to this ticket draft.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not capture ticket evidence.');
    }
  };

  const prefillFromDelivery = (deliveryId: string) => {
    const delivery = pendingDeliveries.find((entry) => entry.id === deliveryId);

    if (!delivery) {
      return;
    }

    setTicketType('material');
    setMaterialIssueType('quantity');
    setSeverity('medium');
    setSourceVisitorId(delivery.id);
    setSubjectName(`${delivery.visitorName} delivery`);
    setCategory('Gate delivery inspection');
    setLocationName(delivery.gateName);
    setNote(
      `${delivery.purpose}${delivery.vehicleNumber ? ` | Vehicle: ${delivery.vehicleNumber}` : ''}`,
    );
    setInspectionOutcome('pending');
    setMessage(`Material inspection prefilled from ${delivery.visitorName}.`);
  };

  const handleCreateTicket = async () => {
    if (!subjectName.trim() || !category.trim() || !note.trim()) {
      setMessage('Subject, category, and note are required before creating a ticket.');
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const parsedOrderedQuantity = showMaterialFields ? parseNumericValue(orderedQuantity) : null;
      const parsedReceivedQuantity = showMaterialFields ? parseNumericValue(receivedQuantity) : null;
      const parsedReturnQuantity = showMaterialFields ? parseNumericValue(returnQuantity) : null;

      if (showMaterialFields && (parsedOrderedQuantity === null || parsedReceivedQuantity === null)) {
        setMessage('Ordered and received quantities are required for material tickets.');
        return;
      }

      if (
        showMaterialFields &&
        parsedOrderedQuantity !== null &&
        parsedReceivedQuantity !== null &&
        parsedReceivedQuantity > parsedOrderedQuantity
      ) {
        setMessage('Received quantity cannot be higher than ordered quantity in this workflow.');
        return;
      }

      if (previewMode) {
        await createPreviewTicket({
          ticketType,
          materialIssueType: showMaterialFields ? materialIssueType : null,
          subjectName: subjectName.trim(),
          category: category.trim(),
          severity,
          note: note.trim(),
          evidenceUris,
          batchNumber: showMaterialFields ? batchNumber.trim() || undefined : undefined,
          orderedQuantity: parsedOrderedQuantity,
          receivedQuantity: parsedReceivedQuantity,
          returnQuantity: parsedReturnQuantity,
          locationName: locationName.trim() || null,
          sourceVisitorId,
          inspectionOutcome:
            showMaterialFields && inspectionOutcome !== 'pending' ? inspectionOutcome : null,
        });

        setMessage('Issue ticket created and added to the oversight queue.');
        resetForm();
        return;
      }

      const result =
        ticketType === 'behavior'
          ? await createBehaviorTicket({
              subjectName: subjectName.trim(),
              category: category.trim(),
              severity,
              note: note.trim(),
              evidenceUris,
              locationName: locationName.trim() || null,
            })
          : await createMaterialTicket({
              subjectName: subjectName.trim(),
              category: category.trim(),
              materialIssueType,
              severity,
              note: note.trim(),
              evidenceUris,
              batchNumber: batchNumber.trim() || null,
              orderedQuantity: parsedOrderedQuantity,
              receivedQuantity: parsedReceivedQuantity,
              returnQuantity: parsedReturnQuantity,
              locationName: locationName.trim() || null,
              sourceVisitorId,
              inspectionOutcome: inspectionOutcome === 'pending' ? null : inspectionOutcome,
            });

      if (result?.success === false) {
        throw new Error(result.error ?? 'Ticket creation failed.');
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['oversight', 'tickets', profile?.userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['oversight', 'pending-deliveries', profile?.userId],
        }),
      ]);

      const returnTicketNumber =
        ticketType === 'material' &&
        result &&
        typeof result === 'object' &&
        'return_ticket_number' in result &&
        typeof result.return_ticket_number === 'string'
          ? result.return_ticket_number
          : null;

      setMessage(
        returnTicketNumber
          ? `Material ticket saved and return ticket ${returnTicketNumber} was created automatically.`
          : ticketType === 'material' && inspectionOutcome === 'approved'
            ? 'Material inspection saved and marked closed.'
            : 'Issue ticket created successfully.',
      );
      resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ticket creation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetTicketStatus = async (ticket: OversightTicketRecord, status: OversightTicketStatus) => {
    setBusyTicketId(ticket.id);
    setMessage(null);

    try {
      if (previewMode) {
        await setPreviewTicketStatus(ticket.id, status);
      } else {
        const result = await updateTicketMutation.mutateAsync({
          ticketId: ticket.id,
          status,
          resolutionNotes:
            status === 'closed'
              ? `Closed from oversight mobile by ${profile?.fullName ?? 'supervisor'}.`
              : undefined,
        });

        if (result?.success === false) {
          throw new Error(result.error ?? 'Ticket status update failed.');
        }
      }

      setMessage(
        status === 'acknowledged'
          ? `Ticket acknowledged for ${ticket.subjectName}.`
          : `Ticket closed for ${ticket.subjectName}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ticket status update failed.');
    } finally {
      setBusyTicketId(null);
    }
  };

  return (
    <ScreenShell
      eyebrow="Issue Desk"
      title="Behavior and material tickets"
      description="Capture guard discipline issues, inspect material deliveries, upload photo evidence, and keep return follow-up linked to the original gate event."
    >
      {!previewMode && pendingDeliveries.length ? (
        <InfoCard>
          <View style={styles.headerRow}>
            <View style={styles.copyWrap}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Pending material deliveries
              </Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                Gate deliveries can launch a material inspection directly from this queue.
              </Text>
            </View>
            <PackageSearch color={colors.info} size={22} />
          </View>
          {pendingDeliveries.map((delivery) => (
            <View key={delivery.id} style={styles.deliveryCard}>
              <View style={styles.headerRow}>
                <View style={styles.copyWrap}>
                  <Text style={[styles.ticketTitle, { color: colors.foreground }]}>
                    {delivery.visitorName}
                  </Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {delivery.gateName} | {formatValue(delivery.entryTime)}
                  </Text>
                </View>
                <StatusChip
                  label={sourceVisitorId === delivery.id ? 'Prefilled' : 'Awaiting inspection'}
                  tone={sourceVisitorId === delivery.id ? 'info' : 'warning'}
                />
              </View>
              <Text style={[styles.caption, { color: colors.foreground }]}>{delivery.purpose}</Text>
              {delivery.vehicleNumber ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Vehicle: {delivery.vehicleNumber}
                </Text>
              ) : null}
              <ActionButton
                label="Prefill inspection"
                variant="secondary"
                onPress={() => prefillFromDelivery(delivery.id)}
              />
            </View>
          ))}
        </InfoCard>
      ) : null}

      <InfoCard>
        <View style={styles.headerRow}>
          <View style={styles.copyWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Create a new ticket</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Use one form for staff behavior issues and material inspection follow-up.
            </Text>
          </View>
          <ShieldAlert color={colors.destructive} size={22} />
        </View>
        {message ? <Text style={[styles.caption, { color: colors.primary }]}>{message}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Ticket type</Text>
          <View style={styles.selectorWrap}>
            {TICKET_TYPE_OPTIONS.map((option) => {
              const isSelected = option.value === ticketType;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setTicketType(option.value)}
                  style={[
                    styles.selectorButton,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.secondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorLabel,
                      {
                        color: isSelected ? colors.primaryForeground : colors.foreground,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {showMaterialFields ? (
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Material issue</Text>
            <View style={styles.selectorWrap}>
              {MATERIAL_ISSUE_OPTIONS.map((option) => {
                const isSelected = option.value === materialIssueType;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    onPress={() => setMaterialIssueType(option.value)}
                    style={[
                      styles.selectorButton,
                      {
                        backgroundColor: isSelected ? colors.info : colors.secondary,
                        borderColor: isSelected ? colors.info : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectorLabel,
                        {
                          color: isSelected ? colors.infoForeground : colors.foreground,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Severity</Text>
          <View style={styles.selectorWrap}>
            {SEVERITY_OPTIONS.map((option) => {
              const isSelected = option.value === severity;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setSeverity(option.value)}
                  style={[
                    styles.selectorButton,
                    {
                      backgroundColor: isSelected ? colors.warning : colors.secondary,
                      borderColor: isSelected ? colors.warning : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorLabel,
                      {
                        color: isSelected ? colors.warningForeground : colors.foreground,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <FormField
          label={ticketType === 'behavior' ? 'Guard or staff name' : 'Material or delivery name'}
          onChangeText={setSubjectName}
          placeholder={ticketType === 'behavior' ? 'Ritu Nair' : 'Lobby sanitiser refill'}
          value={subjectName}
        />
        <FormField
          label="Category"
          onChangeText={setCategory}
          placeholder={ticketType === 'behavior' ? 'Uniform non-compliance' : 'Damaged seal'}
          value={category}
        />
        <FormField
          label="Location"
          onChangeText={setLocationName}
          placeholder="North Gate"
          value={locationName}
        />
        <FormField
          label="Note"
          multiline
          onChangeText={setNote}
          placeholder="Describe what happened and what needs follow-up."
          style={styles.multilineField}
          textAlignVertical="top"
          value={note}
        />

        <View style={styles.evidenceBlock}>
          <View style={styles.headerRow}>
            <View style={styles.copyWrap}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Evidence</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {evidenceUris.length
                  ? `${evidenceUris.length} photo${evidenceUris.length === 1 ? '' : 's'} attached`
                  : 'Capture one or more photos before submitting.'}
              </Text>
            </View>
            <Camera color={colors.info} size={20} />
          </View>
          <ActionButton
            label="Capture evidence"
            variant="secondary"
            onPress={() => void handleCaptureEvidence()}
          />
        </View>

        {showMaterialFields ? (
          <View style={styles.materialSection}>
            <View style={styles.headerRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Material details</Text>
              <PackageSearch color={colors.info} size={20} />
            </View>
            {selectedDelivery ? (
              <View style={[styles.prefillBanner, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Linked delivery: {selectedDelivery.visitorName} at {selectedDelivery.gateName}
                </Text>
              </View>
            ) : null}
            <FormField
              label="Batch number"
              onChangeText={setBatchNumber}
              placeholder="BATCH-AC-119"
              value={batchNumber}
            />
            <View style={styles.twoColumnRow}>
              <View style={styles.column}>
                <FormField
                  keyboardType="number-pad"
                  label="Ordered qty"
                  onChangeText={setOrderedQuantity}
                  placeholder="40"
                  value={orderedQuantity}
                />
              </View>
              <View style={styles.column}>
                <FormField
                  keyboardType="number-pad"
                  label="Received qty"
                  onChangeText={setReceivedQuantity}
                  placeholder="36"
                  value={receivedQuantity}
                />
              </View>
            </View>
            <FormField
              keyboardType="number-pad"
              label="Return qty (optional)"
              onChangeText={setReturnQuantity}
              placeholder="4"
              value={returnQuantity}
            />
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Inspection outcome
              </Text>
              <View style={styles.selectorWrap}>
                {INSPECTION_OPTIONS.map((option) => {
                  const isSelected = option.value === inspectionOutcome;

                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      onPress={() => setInspectionOutcome(option.value)}
                      style={[
                        styles.selectorButton,
                        {
                          backgroundColor: isSelected ? colors.success : colors.secondary,
                          borderColor: isSelected ? colors.success : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectorLabel,
                          {
                            color: isSelected ? colors.successForeground : colors.foreground,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        <ActionButton
          label={isSaving ? 'Saving...' : 'Create ticket'}
          loading={isSaving}
          onPress={() => void handleCreateTicket()}
        />
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Open oversight queue</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Tickets are ordered so the unresolved items stay at the top for quick follow-up.
        </Text>
        {sortedTickets.length ? (
          sortedTickets.map((ticket) => (
            <View key={ticket.id} style={styles.ticketCard}>
              <View style={styles.headerRow}>
                <View style={styles.copyWrap}>
                  <Text style={[styles.ticketTitle, { color: colors.foreground }]}>
                    {ticket.ticketNumber ? `${ticket.ticketNumber} • ` : ''}
                    {ticket.subjectName}
                  </Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {getTypeLabel(ticket)} | {ticket.category} | {formatValue(ticket.createdAt)}
                  </Text>
                </View>
                <View style={styles.ticketStatusWrap}>
                  <StatusChip label={ticket.status} tone={getStatusTone(ticket.status)} />
                  <StatusChip label={ticket.severity} tone={getSeverityTone(ticket.severity)} />
                </View>
              </View>
              <Text style={[styles.caption, { color: colors.foreground }]}>{ticket.note}</Text>
              {ticket.locationName ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Location: {ticket.locationName}
                </Text>
              ) : null}
              {ticket.batchNumber ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Batch: {ticket.batchNumber}
                </Text>
              ) : null}
              {ticket.orderedQuantity !== null || ticket.receivedQuantity !== null ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Ordered: {ticket.orderedQuantity ?? '-'} | Received: {ticket.receivedQuantity ?? '-'} |
                  Shortage: {ticket.shortageQuantity ?? '-'}
                  {ticket.returnQuantity !== null ? ` | Return: ${ticket.returnQuantity}` : ''}
                </Text>
              ) : null}
              {ticket.inspectionOutcome ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Inspection: {ticket.inspectionOutcome}
                </Text>
              ) : null}
              {ticket.parentTicketId ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Linked return from parent ticket
                </Text>
              ) : null}
              {ticket.evidenceUris.length ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  Evidence attached: {ticket.evidenceUris.length}
                </Text>
              ) : null}
              <View style={styles.actionButtonRow}>
                <ActionButton
                  label={busyTicketId === ticket.id && ticket.status === 'open' ? 'Saving...' : 'Acknowledge'}
                  variant="secondary"
                  disabled={busyTicketId === ticket.id || ticket.status !== 'open'}
                  onPress={() => void handleSetTicketStatus(ticket, 'acknowledged')}
                />
                <ActionButton
                  label={busyTicketId === ticket.id && ticket.status !== 'closed' ? 'Saving...' : 'Close'}
                  variant="ghost"
                  disabled={busyTicketId === ticket.id || ticket.status === 'closed'}
                  onPress={() => void handleSetTicketStatus(ticket, 'closed')}
                />
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            No behavior or material tickets have been raised in this oversight session yet.
          </Text>
        )}
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  copyWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  selectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  selectorButton: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  selectorLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  multilineField: {
    minHeight: 120,
    paddingTop: Spacing.base,
  },
  evidenceBlock: {
    gap: Spacing.base,
  },
  materialSection: {
    gap: Spacing.base,
  },
  prefillBanner: {
    borderRadius: 18,
    padding: Spacing.base,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  column: {
    flex: 1,
  },
  deliveryCard: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  ticketCard: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  ticketTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  ticketStatusWrap: {
    gap: Spacing.sm,
  },
  actionButtonRow: {
    gap: Spacing.base,
  },
});
