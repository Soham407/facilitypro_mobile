import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Camera, CheckCircle2, ClipboardList, Hash } from 'lucide-react-native';

import { ProgressBar } from '../../components/guard/ProgressBar';
import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchGuardChecklistItems, isPreviewProfile, submitGuardChecklist } from '../../lib/mobileBackend';
import { capturePhoto } from '../../lib/media';
import { cancelChecklistReminder } from '../../lib/notifications';
import type { GuardTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useGuardStore } from '../../store/useGuardStore';
import type { GuardChecklistItem } from '../../types/guard';

type GuardChecklistScreenProps = BottomTabScreenProps<GuardTabParamList, 'GuardChecklist'>;

function formatCompletedAt(value: string | null) {
  if (!value) {
    return 'Pending';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isChecklistReady(items: GuardChecklistItem[]) {
  return (
    items.length > 0 &&
    items.every((item) => {
      if (item.requiredEvidence && !item.evidenceUri) {
        return false;
      }

      if (item.inputType === 'numeric') {
        return item.numericValue.trim().length > 0;
      }

      return item.status === 'completed';
    })
  );
}

function hasChecklistReopenOverride(items: GuardChecklistItem[]) {
  return items.some((item) => item.overrideStatus === 'approved');
}

export function GuardChecklistScreen(_props: GuardChecklistScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const queryClient = useQueryClient();
  const previewMode = isPreviewProfile(profile);
  const previewChecklistItems = useGuardStore((state) => state.checklistItems);
  const previewChecklistSubmittedAt = useGuardStore((state) => state.checklistSubmittedAt);
  const isOfflineMode = useGuardStore((state) => state.isOfflineMode);
  const isNetworkOnline = useGuardStore((state) => state.isNetworkOnline);
  const hydrateChecklistItems = useGuardStore((state) => state.hydrateChecklistItems);
  const toggleChecklistItem = useGuardStore((state) => state.toggleChecklistItem);
  const attachChecklistEvidence = useGuardStore((state) => state.attachChecklistEvidence);
  const updateChecklistNumericValue = useGuardStore((state) => state.updateChecklistNumericValue);
  const submitPreviewChecklist = useGuardStore((state) => state.submitChecklist);
  const useLocalQueueFlow = previewMode || isOfflineMode || !isNetworkOnline;

  const remoteChecklistQuery = useQuery({
    queryKey: ['guard', 'checklist', profile?.userId],
    queryFn: fetchGuardChecklistItems,
    enabled: Boolean(profile?.userId) && !previewMode && !isOfflineMode && isNetworkOnline,
    refetchInterval: 60000,
  });

  const remoteChecklistSubmittedAt =
    remoteChecklistQuery.data?.find((item) => item.completedAt)?.completedAt ?? null;

  const [draftItems, setDraftItems] = useState<GuardChecklistItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useEffect(() => {
    void cancelChecklistReminder().catch(() => {});
  }, []);

  useEffect(() => {
    if (!useLocalQueueFlow && remoteChecklistQuery.data) {
      setDraftItems(remoteChecklistQuery.data);
    }
  }, [remoteChecklistQuery.data, useLocalQueueFlow]);

  useEffect(() => {
    if (remoteChecklistQuery.data) {
      void hydrateChecklistItems(remoteChecklistQuery.data, remoteChecklistSubmittedAt);
    }
  }, [hydrateChecklistItems, remoteChecklistQuery.data, remoteChecklistSubmittedAt]);

  useEffect(() => {
    if (!useLocalQueueFlow && draftItems.length) {
      void hydrateChecklistItems(draftItems, remoteChecklistSubmittedAt);
    }
  }, [draftItems, hydrateChecklistItems, remoteChecklistSubmittedAt, useLocalQueueFlow]);

  const submitMutation = useMutation({
    mutationFn: async (items: GuardChecklistItem[]) => submitGuardChecklist(items),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['guard', 'checklist', profile?.userId],
      });
    },
  });

  const checklistItems = useLocalQueueFlow ? previewChecklistItems : draftItems;
  const checklistSubmittedAt = useLocalQueueFlow
    ? previewChecklistSubmittedAt
    : remoteChecklistSubmittedAt;
  const hasOverrideApproval = hasChecklistReopenOverride(checklistItems);
  const checklistLocked = Boolean(checklistSubmittedAt) && !hasOverrideApproval;
  const overrideItem =
    checklistItems.find((item) => item.overrideStatus === 'approved') ??
    checklistItems.find((item) => item.overrideStatus === 'resubmitted') ??
    null;

  const completedCount = useMemo(
    () =>
      checklistItems.filter((item) =>
        item.inputType === 'numeric'
          ? item.numericValue.trim().length > 0
          : item.status === 'completed',
      ).length,
    [checklistItems],
  );

  const progress = checklistItems.length ? (completedCount / checklistItems.length) * 100 : 0;

  const updateRemoteDraftItem = (itemId: string, updater: (item: GuardChecklistItem) => GuardChecklistItem) => {
    setDraftItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  };

  const handleToggle = async (itemId: string) => {
    const item = checklistItems.find((entry) => entry.id === itemId);

    if (!item || checklistLocked) {
      return;
    }

    if (item.requiredEvidence && item.status === 'pending' && !item.evidenceUri) {
      setMessage(`Capture evidence for "${item.title}" before marking it complete.`);
      return;
    }

    if (item.inputType === 'numeric') {
      return;
    }

    setMessage(null);

    if (useLocalQueueFlow) {
      await toggleChecklistItem(itemId);
      return;
    }

    updateRemoteDraftItem(itemId, (current) => {
      const isCompleted = current.status === 'completed';

      return {
        ...current,
        completedAt: isCompleted ? null : new Date().toISOString(),
        responseValue: isCompleted ? null : 'yes',
        status: isCompleted ? 'pending' : 'completed',
      };
    });
  };

  const handleCaptureEvidence = async (itemId: string) => {
    setBusyItemId(itemId);
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

      if (useLocalQueueFlow) {
        await attachChecklistEvidence(itemId, photo.uri);
      } else {
        updateRemoteDraftItem(itemId, (current) => ({
          ...current,
          evidenceUri: photo.uri,
          status:
            current.inputType === 'numeric' && current.numericValue.trim().length === 0
              ? current.status
              : 'completed',
        }));
      }

      setMessage('Evidence attached successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not capture evidence right now.');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleNumericValueChange = (itemId: string, value: string) => {
    if (useLocalQueueFlow) {
      void updateChecklistNumericValue(itemId, value);
      return;
    }

    updateRemoteDraftItem(itemId, (current) => ({
      ...current,
      completedAt: value.trim() ? new Date().toISOString() : null,
      numericValue: value,
      responseValue: value.trim() || null,
      status: value.trim() ? 'completed' : 'pending',
    }));
  };

  const handleSubmit = async () => {
    setMessage(null);

    if (useLocalQueueFlow) {
      const result = await submitPreviewChecklist();

      if (!result.submitted) {
        setMessage('Complete every checklist item before submitting the shift checklist.');
        return;
      }

      setMessage(
        result.queued
          ? 'Checklist locked locally and queued for sync.'
          : hasOverrideApproval
            ? 'Checklist resubmitted and locked for this shift.'
            : 'Checklist submitted and locked for this shift.',
      );
      return;
    }

    if (!isChecklistReady(checklistItems)) {
      setMessage('Complete every required response and attach proof before submitting.');
      return;
    }

    try {
      const result = await submitMutation.mutateAsync(checklistItems);

      if (result?.success === false) {
        throw new Error(result.error ?? 'Checklist submission failed.');
      }

      setMessage(
        hasOverrideApproval
          ? 'Checklist resubmitted through the backend workflow.'
          : 'Checklist submitted through the backend workflow and locked for this shift.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Checklist submission failed.');
    }
  };

  return (
    <ScreenShell
      eyebrow="Daily Operations"
      title="Guard Checklist"
      description="Complete the daily checklist using backend-owned master items, attach evidence where required, and lock the response once the shift is verified."
      footer={
        <ActionButton
          label={
            checklistLocked
              ? 'Checklist locked'
              : submitMutation.isPending
                ? hasOverrideApproval
                  ? 'Resubmitting checklist...'
                  : 'Submitting checklist...'
                : hasOverrideApproval
                  ? 'Resubmit checklist'
                  : 'Submit and lock checklist'
          }
          loading={submitMutation.isPending}
          disabled={checklistLocked}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <InfoCard>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Shift progress</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              {completedCount} of {checklistItems.length} tasks complete
            </Text>
          </View>
          <StatusChip
            label={
              hasOverrideApproval
                ? 'Reopened by supervisor'
                : checklistLocked
                  ? 'Locked'
                  : useLocalQueueFlow
                    ? 'Offline-safe'
                    : 'Backend linked'
            }
            tone={
              hasOverrideApproval
                ? 'warning'
                : checklistLocked
                  ? 'success'
                  : useLocalQueueFlow
                    ? 'warning'
                    : 'info'
            }
          />
        </View>
        <ProgressBar value={progress} />
        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
        {overrideItem ? (
          <View style={[styles.overrideBanner, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.overrideTitle, { color: colors.foreground }]}>
              {overrideItem.overrideStatus === 'approved'
                ? 'Supervisor override granted'
                : 'Checklist override has been resubmitted'}
            </Text>
            {overrideItem.overrideReason ? (
              <Text style={[styles.caption, { color: colors.foreground }]}>
                Reason: {overrideItem.overrideReason}
              </Text>
            ) : null}
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              {overrideItem.overriddenByName ?? 'Supervisor'}
              {overrideItem.overriddenAt
                ? ` • ${new Date(overrideItem.overriddenAt).toLocaleString()}`
                : ''}
            </Text>
          </View>
        ) : null}
        {checklistSubmittedAt ? (
          <Text style={[styles.caption, { color: colors.success }]}>
            Submitted at {new Date(checklistSubmittedAt).toLocaleString()}
          </Text>
        ) : null}
      </InfoCard>

      {checklistItems.map((item) => (
        <InfoCard key={item.id}>
          <Pressable
            disabled={checklistLocked || item.inputType === 'numeric'}
            onPress={() => void handleToggle(item.id)}
            style={styles.itemHeader}
          >
            <View
              style={[
                styles.checkIcon,
                {
                  backgroundColor:
                    item.status === 'completed' ? colors.success : colors.secondary,
                  borderColor:
                    item.status === 'completed' ? colors.success : colors.border,
                },
              ]}
            >
              {item.status === 'completed' ? (
                <CheckCircle2 color={colors.successForeground} size={18} />
              ) : item.inputType === 'numeric' ? (
                <Hash color={colors.mutedForeground} size={18} />
              ) : (
                <ClipboardList color={colors.mutedForeground} size={18} />
              )}
            </View>
            <View style={styles.itemCopy}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{item.description}</Text>
            </View>
          </Pressable>

          <View style={styles.metaRow}>
            <StatusChip
              label={item.status === 'completed' ? 'Completed' : 'Pending'}
              tone={item.status === 'completed' ? 'success' : 'default'}
            />
            <StatusChip
              label={item.requiredEvidence ? 'Photo proof required' : 'Visual check'}
              tone={item.requiredEvidence ? 'warning' : 'info'}
            />
            <StatusChip
              label={item.inputType === 'numeric' ? 'Numeric entry' : 'Yes / no'}
              tone={item.inputType === 'numeric' ? 'info' : 'default'}
            />
          </View>

          {item.inputType === 'numeric' ? (
            <FormField
              keyboardType="numeric"
              label={`Reading${item.numericUnitLabel ? ` (${item.numericUnitLabel})` : ''}`}
              onChangeText={(value) => handleNumericValueChange(item.id, value)}
              placeholder={
                item.numericMinValue != null && item.numericMaxValue != null
                  ? `${item.numericMinValue} - ${item.numericMaxValue}`
                  : 'Enter reading'
              }
              value={item.numericValue}
            />
          ) : null}

          <View style={styles.rowBetween}>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              Updated: {formatCompletedAt(item.completedAt)}
            </Text>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {item.evidenceUri ? 'Evidence attached' : 'No evidence attached'}
            </Text>
          </View>

          <ActionButton
            label={
              busyItemId === item.id
                ? 'Opening camera...'
                : item.evidenceUri
                  ? 'Retake evidence'
                  : 'Capture evidence'
            }
            variant="secondary"
            disabled={checklistLocked || busyItemId === item.id}
            onPress={() => void handleCaptureEvidence(item.id)}
          />

          <View style={[styles.evidenceBadge, { backgroundColor: colors.secondary }]}>
            <Camera color={colors.info} size={16} />
            <Text style={[styles.evidenceText, { color: colors.foreground }]}>
              {item.evidenceUri
                ? 'Evidence is attached and will be uploaded during checklist submission.'
                : 'Use the back camera to attach a work-proof image.'}
            </Text>
          </View>
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  headerCopy: {
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
  message: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  overrideBanner: {
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
    padding: Spacing.base,
  },
  overrideTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  itemHeader: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  checkIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  itemTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  metaText: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  evidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  evidenceText: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
