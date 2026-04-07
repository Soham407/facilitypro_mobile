import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Camera, Car, MapPin, UserRound } from 'lucide-react-native';

import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { capturePhoto } from '../../lib/media';
import {
  checkoutGuardVisitor,
  createGuardVisitorEntry,
  fetchGuardVisitors,
  isPreviewProfile,
  searchResidentDestinations,
  type ResidentDestination,
} from '../../lib/mobileBackend';
import type { GuardTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useGuardStore } from '../../store/useGuardStore';
import type { GuardFrequentVisitorTemplate, GuardVisitorType } from '../../types/guard';

type GuardVisitorsScreenProps = BottomTabScreenProps<GuardTabParamList, 'GuardVisitors'>;

function formatVisitorTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function formatApprovalCountdown(value: string | null) {
  if (!value) {
    return null;
  }

  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) {
    return 'Approval window expired';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} approval window`;
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  purpose: '',
  destination: '',
  vehicleNumber: '',
};

const VISITOR_TYPE_OPTIONS: Array<{ label: string; value: GuardVisitorType }> = [
  { label: 'Guest', value: 'guest' },
  { label: 'Delivery', value: 'delivery' },
];

export function GuardVisitorsScreen(_props: GuardVisitorsScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const queryClient = useQueryClient();
  const frequentVisitors = useGuardStore((state) => state.frequentVisitors);
  const previewVisitorLog = useGuardStore((state) => state.visitorLog);
  const isOfflineMode = useGuardStore((state) => state.isOfflineMode);
  const isNetworkOnline = useGuardStore((state) => state.isNetworkOnline);
  const hydrateVisitorLog = useGuardStore((state) => state.hydrateVisitorLog);
  const addVisitor = useGuardStore((state) => state.addVisitor);
  const checkoutVisitor = useGuardStore((state) => state.checkoutVisitor);

  const previewMode = isPreviewProfile(profile);
  const useLocalQueueFlow = previewMode || isOfflineMode || !isNetworkOnline;

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<ResidentDestination | null>(null);
  const [visitorType, setVisitorType] = useState<GuardVisitorType>('guest');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyVisitorId, setBusyVisitorId] = useState<string | null>(null);

  const destinationsQuery = useQuery({
    queryKey: ['guard', 'resident-destinations', form.destination],
    queryFn: () => searchResidentDestinations(form.destination),
    enabled:
      !previewMode &&
      !isOfflineMode &&
      isNetworkOnline &&
      visitorType === 'guest' &&
      form.destination.trim().length >= 2,
    staleTime: 30000,
  });

  const visitorsQuery = useQuery({
    queryKey: ['guard', 'visitors', profile?.userId],
    queryFn: () => fetchGuardVisitors(true),
    enabled: Boolean(profile?.userId) && !previewMode && !isOfflineMode && isNetworkOnline,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (visitorsQuery.data) {
      void hydrateVisitorLog(visitorsQuery.data);
    }
  }, [hydrateVisitorLog, visitorsQuery.data]);

  const checkoutMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      if (!profile?.userId) {
        throw new Error('Guard profile is missing');
      }

      return checkoutGuardVisitor(visitorId, profile.userId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['guard', 'visitors', profile?.userId],
      });
    },
  });

  const insideVisitors = useMemo(
    () =>
      useLocalQueueFlow
        ? previewVisitorLog.filter((visitor) => visitor.status === 'inside')
        : (visitorsQuery.data ?? []).filter((visitor) => visitor.status === 'inside'),
    [previewVisitorLog, useLocalQueueFlow, visitorsQuery.data],
  );

  const handleUseTemplate = (template: GuardFrequentVisitorTemplate) => {
    setVisitorType('guest');
    setSelectedTemplateId(template.id);
    setSelectedDestination(null);
    setForm({
      destination: template.destination,
      name: template.name,
      phone: template.phone,
      purpose: template.purpose,
      vehicleNumber: template.vehicleNumber,
    });
    setMessage(`Loaded frequent visitor template for ${template.name}.`);
  };

  const handleCapturePhoto = async () => {
    setMessage(null);

    try {
      const asset = await capturePhoto({
        cameraType: 'back',
        aspect: [3, 4],
      });

      if (!asset) {
        setMessage('Visitor photo capture was cancelled.');
        return;
      }

      setPhotoUri(asset.uri);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not capture the visitor photo.');
    }
  };

  const handleDestinationPick = (destination: ResidentDestination) => {
    setSelectedDestination(destination);
    setForm((state) => ({
      ...state,
      destination: destination.flatLabel,
    }));
    setMessage(`Linked visitor entry to ${destination.flatLabel}.`);
  };

  const handleSaveVisitor = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.destination.trim() || !form.purpose.trim()) {
      setMessage('Visitor name, phone, destination, and purpose are required.');
      return;
    }

    if (visitorType === 'guest' && !useLocalQueueFlow && !selectedDestination?.flatId) {
      setMessage('Choose a resident flat from the live lookup before logging the visitor.');
      return;
    }

    if (visitorType === 'guest' && !previewMode && useLocalQueueFlow && !selectedDestination?.flatId) {
      setMessage('Pick a resident flat while online before queueing this visitor entry offline.');
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      if (useLocalQueueFlow) {
        const result = await addVisitor({
          destination: form.destination.trim(),
          flatId: selectedDestination?.flatId ?? null,
          frequentVisitor: Boolean(selectedTemplateId),
          name: form.name.trim(),
          phone: form.phone.trim(),
          photoUri,
          purpose: form.purpose.trim(),
          residentId: selectedDestination?.residentId ?? null,
          visitorType,
          vehicleNumber: form.vehicleNumber.trim(),
        });

        setMessage(
          result.queued
            ? 'Visitor entry saved offline and queued for sync.'
            : visitorType === 'delivery'
              ? 'Delivery vehicle logged successfully.'
              : 'Visitor logged successfully.',
        );
      } else {
        const result = await createGuardVisitorEntry({
          destination: form.destination.trim(),
          flatId: selectedDestination?.flatId ?? null,
          isFrequentVisitor: Boolean(selectedTemplateId),
          phone: form.phone.trim(),
          photoUri,
          purpose: form.purpose.trim(),
          vehicleNumber: form.vehicleNumber.trim(),
          visitorType,
          visitorName: form.name.trim(),
        });

        if (result?.success === false) {
          throw new Error(result.error ?? 'Visitor entry could not be created.');
        }

        await queryClient.invalidateQueries({
          queryKey: ['guard', 'visitors', profile?.userId],
        });

        setMessage(
          visitorType === 'delivery'
            ? 'Delivery vehicle logged and material inspection has been routed to oversight.'
            : 'Visitor logged and resident approval has been triggered.',
        );
      }

      setForm(EMPTY_FORM);
      setSelectedTemplateId(null);
      setSelectedDestination(null);
      setVisitorType('guest');
      setPhotoUri(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Visitor entry could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckout = async (id: string) => {
    setBusyVisitorId(id);
    setMessage(null);

    try {
      if (useLocalQueueFlow) {
        const result = await checkoutVisitor(id);
        setMessage(
          !result.updated
            ? 'That visitor is already checked out.'
            : result.queued
              ? 'Checkout recorded offline and queued for sync.'
              : 'Visitor checked out successfully.',
        );
      } else {
        const result = await checkoutMutation.mutateAsync(id);

        if (result?.success === false) {
          throw new Error(result.error ?? 'Visitor checkout failed.');
        }

        setMessage('Visitor checked out successfully.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Visitor checkout failed.');
    } finally {
      setBusyVisitorId(null);
    }
  };

  return (
    <ScreenShell
      eyebrow="Gate Entry"
      title="Visitor Logging"
      description="Capture walk-ins, link them to the correct flat, and keep a live record of who is currently inside the premises."
      footer={
        <ActionButton
          label={isSaving ? 'Logging visitor...' : 'Log visitor entry'}
          loading={isSaving}
          onPress={() => void handleSaveVisitor()}
        />
      }
    >
      {useLocalQueueFlow ? (
        <InfoCard>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Frequent visitors</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Preview/offline mode still supports quick-fill templates for recurring gate entries.
          </Text>
          <View style={styles.templateWrap}>
            {frequentVisitors.map((template) => {
              const isSelected = template.id === selectedTemplateId;

              return (
                <Pressable
                  key={template.id}
                  onPress={() => handleUseTemplate(template)}
                  style={[
                    styles.templateChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.secondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.templateLabel,
                      {
                        color: isSelected ? colors.primaryForeground : colors.foreground,
                      },
                    ]}
                  >
                    {template.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </InfoCard>
      ) : (
        <InfoCard>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {visitorType === 'guest' ? 'Resident lookup' : 'Delivery routing'}
          </Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {visitorType === 'guest'
              ? 'Search by building, flat, or resident name so the app can send a live approval request to the correct household.'
              : 'Delivery entries skip resident approval and go straight into the oversight material inspection queue.'}
          </Text>
          {visitorType === 'guest' ? (
            destinationsQuery.data?.length ? (
              <View style={styles.destinationWrap}>
                {destinationsQuery.data.slice(0, 5).map((destination) => {
                  const isSelected = destination.flatId === selectedDestination?.flatId;

                  return (
                    <Pressable
                      key={destination.flatId}
                      onPress={() => handleDestinationPick(destination)}
                      style={[
                        styles.destinationCard,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.secondary,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <View style={styles.inlineMeta}>
                        <MapPin
                          color={isSelected ? colors.primaryForeground : colors.primary}
                          size={16}
                        />
                        <Text
                          style={[
                            styles.destinationTitle,
                            {
                              color: isSelected ? colors.primaryForeground : colors.foreground,
                            },
                          ]}
                        >
                          {destination.flatLabel}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.caption,
                          {
                            color: isSelected ? colors.primaryForeground : colors.mutedForeground,
                          },
                        ]}
                      >
                        {destination.residentName ?? 'Primary resident pending'} |{' '}
                        {destination.residentPhone ?? 'Phone pending'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : form.destination.trim().length >= 2 ? (
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                No resident lookup results yet for this search.
              </Text>
            ) : null
          ) : (
            <StatusChip label="Oversight material inspection" tone="warning" />
          )}
        </InfoCard>
      )}

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>New visitor entry</Text>
        <View style={styles.typeSelectorRow}>
          {VISITOR_TYPE_OPTIONS.map((option) => {
            const isSelected = option.value === visitorType;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  setVisitorType(option.value);
                  setSelectedDestination(null);
                  setSelectedTemplateId(null);
                }}
                style={[
                  styles.typeSelectorButton,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.secondary,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeSelectorLabel,
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
        <FormField
          label="Visitor name"
          onChangeText={(value) => setForm((state) => ({ ...state, name: value }))}
          placeholder="Enter full name"
          value={form.name}
        />
        <FormField
          keyboardType="phone-pad"
          label="Phone number"
          onChangeText={(value) => setForm((state) => ({ ...state, phone: value }))}
          placeholder="98765 43210"
          value={form.phone}
        />
        <FormField
          label="Purpose of visit"
          onChangeText={(value) => setForm((state) => ({ ...state, purpose: value }))}
          placeholder={visitorType === 'delivery' ? 'Material delivery, courier, vendor drop' : 'Maintenance, guest visit, house help'}
          value={form.purpose}
        />
        <FormField
          label={
            visitorType === 'delivery'
              ? 'Receiving point / note'
              : useLocalQueueFlow
                ? 'Destination'
                : 'Resident / flat search'
          }
          onChangeText={(value) => {
            setSelectedDestination(null);
            setForm((state) => ({ ...state, destination: value }));
          }}
          placeholder={
            visitorType === 'delivery'
              ? 'North Gate receiving bay'
              : useLocalQueueFlow
                ? 'Tower A - Flat 304'
                : 'Search building, flat, or resident'
          }
          value={form.destination}
        />
        <FormField
          label="Vehicle number"
          onChangeText={(value) => setForm((state) => ({ ...state, vehicleNumber: value }))}
          placeholder="Optional"
          value={form.vehicleNumber}
        />

        <View style={styles.photoSection}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.secondary }]}>
              <Camera color={colors.mutedForeground} size={28} />
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                Capture a face photo for gate verification.
              </Text>
            </View>
          )}
          <ActionButton
            label={photoUri ? 'Retake visitor photo' : 'Capture visitor photo'}
            variant="secondary"
            onPress={() => void handleCapturePhoto()}
          />
        </View>

        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
        <StatusChip
          label={
            useLocalQueueFlow
              ? 'Offline-safe entry logging'
              : visitorType === 'delivery'
                ? 'Delivery routed to oversight'
                : 'Live resident approval flow'
          }
          tone={useLocalQueueFlow ? 'warning' : visitorType === 'delivery' ? 'warning' : 'info'}
        />
      </InfoCard>

      <InfoCard>
        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Visitors currently inside</Text>
          <StatusChip label={`${insideVisitors.length} active`} tone="success" />
        </View>
        {insideVisitors.length ? (
          insideVisitors.map((visitor) => {
            const countdown = formatApprovalCountdown(visitor.approvalDeadlineAt);

            return (
              <View key={visitor.id} style={[styles.visitorRow, { borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                  {visitor.photoUrl || visitor.photoUri ? (
                    <Image
                      source={{ uri: visitor.photoUrl ?? visitor.photoUri ?? undefined }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <UserRound color={colors.primary} size={18} />
                  )}
                </View>
                <View style={styles.visitorCopy}>
                  <Text style={[styles.visitorName, { color: colors.foreground }]}>{visitor.name}</Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {visitor.destination} | {visitor.purpose}
                  </Text>
                  <View style={styles.inlineMeta}>
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{visitor.phone}</Text>
                    {visitor.vehicleNumber ? (
                      <View style={styles.inlineMeta}>
                        <Car color={colors.warning} size={14} />
                        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                          {visitor.vehicleNumber}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.inlineMeta}>
                    <StatusChip
                      label={visitor.visitorType === 'delivery' ? 'delivery' : 'guest'}
                      tone={visitor.visitorType === 'delivery' ? 'info' : 'default'}
                    />
                    <StatusChip
                      label={visitor.approvalStatus.replace(/_/g, ' ')}
                      tone={
                        visitor.approvalStatus === 'approved'
                          ? 'success'
                          : visitor.approvalStatus === 'denied' || visitor.approvalStatus === 'timed_out'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                    {countdown ? (
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {countdown}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    Logged {formatVisitorTimestamp(visitor.recordedAt)}
                  </Text>
                  {visitor.entryLocationName ? (
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                      Gate: {visitor.entryLocationName}
                    </Text>
                  ) : null}
                </View>
                <ActionButton
                  label={busyVisitorId === visitor.id ? 'Saving...' : 'Check out'}
                  variant="ghost"
                  disabled={busyVisitorId === visitor.id}
                  onPress={() => void handleCheckout(visitor.id)}
                />
              </View>
            );
          })
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            No active visitor entries yet. New entries will appear here as soon as they are logged.
          </Text>
        )}
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  templateWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  templateChip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  templateLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  destinationWrap: {
    gap: Spacing.sm,
  },
  destinationCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.xs,
    padding: Spacing.base,
  },
  destinationTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeSelectorButton: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  typeSelectorLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  photoSection: {
    gap: Spacing.base,
  },
  photoPlaceholder: {
    alignItems: 'center',
    borderRadius: BorderRadius['2xl'],
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    padding: Spacing.xl,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius['2xl'],
  },
  message: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  visitorRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    borderTopWidth: 1,
    paddingTop: Spacing.base,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  visitorCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  visitorName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  metaText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
});
