import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ClipboardCheck, MapPinned, ScanSearch, Users } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { ProgressBar } from '../../components/guard/ProgressBar';
import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  fetchOversightAttendanceLog,
  fetchOversightLiveGuards,
  fetchOversightVisitorStats,
  isPreviewProfile,
  reopenGuardChecklist,
} from '../../lib/mobileBackend';
import type { OversightTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useOversightStore } from '../../store/useOversightStore';
import type { OversightAttendanceRecord, OversightGuardRecord } from '../../types/oversight';

type OversightOperationsScreenProps = BottomTabScreenProps<
  OversightTabParamList,
  'OversightOperations'
>;

function formatValue(value: string | null) {
  if (!value) {
    return 'Awaiting record';
  }

  return new Date(value).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function getGuardTone(status: OversightGuardRecord['status']) {
  if (status === 'on_duty') {
    return 'success';
  }

  if (status === 'offline') {
    return 'warning';
  }

  if (status === 'breach') {
    return 'danger';
  }

  return 'default';
}

function getAttendanceTone(status: OversightAttendanceRecord['status']) {
  if (status === 'on_shift' || status === 'completed') {
    return 'success';
  }

  if (status === 'late') {
    return 'warning';
  }

  return 'danger';
}

function getGeoTone(status: OversightAttendanceRecord['geoStatus']) {
  if (status === 'verified') {
    return 'success';
  }

  if (status === 'outside_fence') {
    return 'warning';
  }

  return 'danger';
}

export function OversightOperationsScreen(_props: OversightOperationsScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const previewMode = isPreviewProfile(profile);
  const queryClient = useQueryClient();
  const role = useOversightStore((state) => state.role);
  const previewGuards = useOversightStore((state) => state.guards);
  const previewVisitorStats = useOversightStore((state) => state.visitorStats);
  const previewAttendanceLog = useOversightStore((state) => state.attendanceLog);
  const refreshPreviewFeed = useOversightStore((state) => state.refreshFeed);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overrideGuardId, setOverrideGuardId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const guardsQuery = useQuery({
    queryKey: ['oversight', 'guards', profile?.userId],
    queryFn: fetchOversightLiveGuards,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 60000,
  });

  const visitorStatsQuery = useQuery({
    queryKey: ['oversight', 'visitor-stats', profile?.userId],
    queryFn: fetchOversightVisitorStats,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 60000,
  });

  const attendanceQuery = useQuery({
    queryKey: ['oversight', 'attendance', profile?.userId],
    queryFn: fetchOversightAttendanceLog,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 60000,
  });

  const reopenChecklistMutation = useMutation({
    mutationFn: async (input: { guardId: string; reason: string }) =>
      reopenGuardChecklist(input.guardId, input.reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['oversight', 'guards', profile?.userId],
      });
    },
  });

  const guards = previewMode ? previewGuards : guardsQuery.data ?? [];
  const visitorStats = previewMode ? previewVisitorStats : visitorStatsQuery.data ?? [];
  const attendanceLog = previewMode ? previewAttendanceLog : attendanceQuery.data ?? [];

  const checklistRate = useMemo(() => {
    const total = guards.reduce((sum, guard) => sum + guard.checklistTotal, 0);
    const completed = guards.reduce((sum, guard) => sum + guard.checklistCompleted, 0);

    if (!total) {
      return 0;
    }

    return Math.round((completed / total) * 100);
  }, [guards]);

  const pendingApprovals = useMemo(
    () => visitorStats.reduce((sum, gate) => sum + gate.pendingApprovals, 0),
    [visitorStats],
  );
  const deliveryVehicles = useMemo(
    () => visitorStats.reduce((sum, gate) => sum + gate.deliveryVehicles, 0),
    [visitorStats],
  );
  const attendanceExceptions = useMemo(
    () =>
      attendanceLog.filter(
        (entry) =>
          entry.status === 'late' || entry.status === 'absent' || entry.geoStatus !== 'verified',
      ).length,
    [attendanceLog],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);

    try {
      if (previewMode) {
        await refreshPreviewFeed();
      } else {
        await Promise.all([
          guardsQuery.refetch(),
          visitorStatsQuery.refetch(),
          attendanceQuery.refetch(),
        ]);
      }

      setMessage('Operations board refreshed with the latest patrol and gate movement.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReopenChecklist = async (guard: OversightGuardRecord) => {
    if (!overrideReason.trim()) {
      setMessage('Add a short reason before reopening the checklist.');
      return;
    }

    try {
      const result = await reopenChecklistMutation.mutateAsync({
        guardId: guard.id,
        reason: overrideReason.trim(),
      });

      if (result?.success === false) {
        throw new Error(result.error ?? 'Checklist override could not be saved.');
      }

      setMessage(`Checklist reopened for ${guard.guardName}.`);
      setOverrideGuardId(null);
      setOverrideReason('');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Checklist override could not be saved.',
      );
    }
  };

  return (
    <ScreenShell
      eyebrow={role === 'society_manager' ? 'Property Operations' : 'Field Operations'}
      title="Checklist, visitor, and attendance board"
      description="Review checklist completion, gate throughput, attendance exceptions, and reopen a locked checklist when a supervisor override is needed."
    >
      <InfoCard>
        <View style={styles.headerRow}>
          <View style={styles.copyWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Operations heartbeat
            </Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              Use this board to follow guard execution quality and spot gaps before they turn into incidents.
            </Text>
          </View>
          <StatusChip
            label={attendanceExceptions ? `${attendanceExceptions} exceptions` : 'On track'}
            tone={attendanceExceptions ? 'warning' : 'success'}
          />
        </View>
        {message ? <Text style={[styles.caption, { color: colors.primary }]}>{message}</Text> : null}
        <View style={styles.actionRow}>
          <ActionButton
            label={isRefreshing ? 'Refreshing...' : 'Refresh board'}
            loading={isRefreshing}
            onPress={() => void handleRefresh()}
          />
        </View>
      </InfoCard>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ClipboardCheck color={colors.success} size={20} />}
            label="Checklist rate"
            value={`${checklistRate}%`}
            caption="Across active guards"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ScanSearch color={colors.warning} size={20} />}
            label="Pending approvals"
            value={String(pendingApprovals)}
            caption={`${deliveryVehicles} delivery vehicles today`}
          />
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<Users color={colors.primary} size={20} />}
            label="Attendance issues"
            value={String(attendanceExceptions)}
            caption="Late, absent, or outside fence"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<MapPinned color={colors.info} size={20} />}
            label="Active gates"
            value={String(visitorStats.length)}
            caption="Visitor and delivery checkpoints"
          />
        </View>
      </View>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Checklist board</Text>
        {guards.length ? (
          guards.map((guard) => {
            const progress = guard.checklistTotal
              ? Math.round((guard.checklistCompleted / guard.checklistTotal) * 100)
              : 0;
            const isEditingOverride = overrideGuardId === guard.id;

            return (
              <View key={guard.id} style={styles.recordCard}>
                <View style={styles.headerRow}>
                  <View style={styles.copyWrap}>
                    <Text style={[styles.recordTitle, { color: colors.foreground }]}>
                      {guard.guardName} ({guard.guardCode})
                    </Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {guard.assignedLocationName} | Shift {guard.currentShiftLabel}
                    </Text>
                  </View>
                  <StatusChip
                    label={guard.status.replace(/_/g, ' ')}
                    tone={getGuardTone(guard.status)}
                  />
                </View>
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  {guard.checklistCompleted}/{guard.checklistTotal} tasks done | Last seen{' '}
                  {formatValue(guard.lastSeenAt)}
                </Text>
                <ProgressBar value={progress} />
                {!previewMode ? (
                  isEditingOverride ? (
                    <View style={styles.overrideComposer}>
                      <FormField
                        label="Override reason"
                        multiline
                        onChangeText={setOverrideReason}
                        placeholder="Explain why the guard may reopen and resubmit the checklist."
                        value={overrideReason}
                      />
                      <View style={styles.overrideActionRow}>
                        <ActionButton
                          label={
                            reopenChecklistMutation.isPending ? 'Saving...' : 'Confirm reopen'
                          }
                          loading={reopenChecklistMutation.isPending}
                          onPress={() => void handleReopenChecklist(guard)}
                        />
                        <ActionButton
                          label="Cancel"
                          variant="ghost"
                          onPress={() => {
                            setOverrideGuardId(null);
                            setOverrideReason('');
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <ActionButton
                      label="Reopen checklist"
                      variant="secondary"
                      onPress={() => {
                        setOverrideGuardId(guard.id);
                        setOverrideReason('');
                        setMessage(null);
                      }}
                    />
                  )
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {previewMode
              ? 'No active guards are linked to this oversight session yet.'
              : 'No active guards were returned by the live oversight feed.'}
          </Text>
        )}
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Visitor gate flow</Text>
        {visitorStats.length ? (
          visitorStats.map((gate) => (
            <View key={gate.id} style={styles.recordCard}>
              <View style={styles.headerRow}>
                <View style={styles.copyWrap}>
                  <Text style={[styles.recordTitle, { color: colors.foreground }]}>
                    {gate.gateName}
                  </Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {gate.visitorsToday} visitors today | {gate.visitorsThisWeek} this week
                  </Text>
                </View>
                <StatusChip
                  label={gate.pendingApprovals ? `${gate.pendingApprovals} pending` : 'Clear'}
                  tone={gate.pendingApprovals ? 'warning' : 'success'}
                />
              </View>
              <Text style={[styles.caption, { color: colors.foreground }]}>
                Delivery vehicles: {gate.deliveryVehicles}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Visitor throughput data will appear here after the first gate activity is logged.
          </Text>
        )}
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attendance log</Text>
        {attendanceLog.length ? (
          attendanceLog.map((entry) => (
            <View key={entry.id} style={styles.recordCard}>
              <View style={styles.headerRow}>
                <View style={styles.copyWrap}>
                  <Text style={[styles.recordTitle, { color: colors.foreground }]}>
                    {entry.employeeName}
                  </Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {entry.roleLabel} | {entry.locationName}
                  </Text>
                </View>
                <StatusChip
                  label={entry.status.replace(/_/g, ' ')}
                  tone={getAttendanceTone(entry.status)}
                />
              </View>
              <View style={styles.metaWrap}>
                <StatusChip
                  label={entry.geoStatus.replace(/_/g, ' ')}
                  tone={getGeoTone(entry.geoStatus)}
                />
                <Text style={[styles.caption, { color: colors.foreground }]}>
                  In: {formatValue(entry.checkInAt)} | Out: {formatValue(entry.checkOutAt)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Attendance exceptions will show up here once the first mobile shift record is created.
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
  actionRow: {
    gap: Spacing.base,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  metricCell: {
    flex: 1,
  },
  recordCard: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  recordTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  metaWrap: {
    gap: Spacing.sm,
  },
  overrideComposer: {
    gap: Spacing.base,
  },
  overrideActionRow: {
    gap: Spacing.base,
  },
});
