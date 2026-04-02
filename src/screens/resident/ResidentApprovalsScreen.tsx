import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Clock3, ShieldCheck, ShieldX } from 'lucide-react-native';

import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  approveResidentVisitor,
  denyResidentVisitor,
  fetchResidentPendingVisitors,
  setResidentFrequentVisitor,
} from '../../lib/mobileBackend';
import type { ResidentTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';

type ResidentApprovalsScreenProps = BottomTabScreenProps<
  ResidentTabParamList,
  'ResidentApprovals'
>;

function formatCountdown(value: string | null) {
  if (!value) {
    return 'No deadline';
  }

  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) {
    return 'Decision window expired';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} remaining`;
}

export function ResidentApprovalsScreen(_props: ResidentApprovalsScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const visitorsQuery = useQuery({
    queryKey: ['resident', 'pending-visitors', profile?.userId],
    queryFn: fetchResidentPendingVisitors,
    enabled: Boolean(profile?.userId),
    refetchInterval: 10000,
  });

  const refreshVisitors = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['resident', 'pending-visitors', profile?.userId],
    });
  };

  const approveMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      if (!profile?.userId) {
        throw new Error('Resident profile is missing');
      }

      return approveResidentVisitor(visitorId, profile.userId);
    },
    onSuccess: async () => {
      setMessage('Visitor approved successfully.');
      await refreshVisitors();
    },
  });

  const denyMutation = useMutation({
    mutationFn: async (visitorId: string) => {
      if (!profile?.userId) {
        throw new Error('Resident profile is missing');
      }

      return denyResidentVisitor(visitorId, profile.userId, 'Declined from resident mobile app');
    },
    onSuccess: async () => {
      setMessage('Visitor denied successfully.');
      await refreshVisitors();
    },
  });

  const frequentMutation = useMutation({
    mutationFn: async (input: { visitorId: string; isFrequent: boolean }) =>
      setResidentFrequentVisitor(input.visitorId, input.isFrequent),
    onSuccess: async (_data, variables) => {
      setMessage(
        variables.isFrequent
          ? 'Visitor saved as frequent.'
          : 'Visitor removed from frequent list.',
      );
      await refreshVisitors();
    },
  });

  const orderedVisitors = useMemo(
    () =>
      [...(visitorsQuery.data ?? [])].sort((left, right) => {
        const leftTime = left.approvalDeadlineAt ? new Date(left.approvalDeadlineAt).getTime() : 0;
        const rightTime = right.approvalDeadlineAt ? new Date(right.approvalDeadlineAt).getTime() : 0;
        return leftTime - rightTime;
      }),
    [visitorsQuery.data],
  );

  return (
    <ScreenShell
      eyebrow="Gate Approval"
      title="Resident visitor decisions"
      description="Approve or deny gate entries from the resident side and keep trusted visitors marked for quicker repeat access."
    >
      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Approval queue</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Live visitor requests from the guard desk appear here with the active 30-second decision window.
        </Text>
        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
      </InfoCard>

      {orderedVisitors.length ? (
        orderedVisitors.map((visitor) => (
          <InfoCard key={visitor.id}>
            <View style={styles.headerRow}>
              <View style={styles.visitorHeading}>
                <Text style={[styles.visitorName, { color: colors.foreground }]}>
                  {visitor.visitorName}
                </Text>
                <Text style={[styles.copy, { color: colors.mutedForeground }]}>
                  {visitor.flatLabel} | {visitor.purpose}
                </Text>
              </View>
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
            </View>

            {visitor.photoUrl ? (
              <Image source={{ uri: visitor.photoUrl }} style={styles.photo} />
            ) : null}

            <View style={styles.metaRow}>
              <View style={styles.inlineMeta}>
                <Clock3 color={colors.warning} size={16} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {formatCountdown(visitor.approvalDeadlineAt)}
                </Text>
              </View>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {visitor.phone || 'Phone unavailable'}
              </Text>
              {visitor.vehicleNumber ? (
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  Vehicle: {visitor.vehicleNumber}
                </Text>
              ) : null}
            </View>

            <View style={styles.actionGroup}>
              <ActionButton
                label={approveMutation.isPending ? 'Approving...' : 'Approve visitor'}
                disabled={
                  approveMutation.isPending ||
                  visitor.approvalStatus !== 'pending'
                }
                onPress={() => approveMutation.mutate(visitor.id)}
              />
              <ActionButton
                label={denyMutation.isPending ? 'Denying...' : 'Deny visitor'}
                variant="danger"
                disabled={denyMutation.isPending || visitor.approvalStatus !== 'pending'}
                onPress={() => denyMutation.mutate(visitor.id)}
              />
              <ActionButton
                label={
                  frequentMutation.isPending
                    ? 'Saving...'
                    : visitor.isFrequentVisitor
                      ? 'Remove frequent'
                      : 'Mark frequent'
                }
                variant="ghost"
                onPress={() =>
                  frequentMutation.mutate({
                    visitorId: visitor.id,
                    isFrequent: !visitor.isFrequentVisitor,
                  })
                }
              />
            </View>

            <View style={styles.inlineMeta}>
              <ShieldCheck color={colors.success} size={16} />
              <Text style={[styles.copy, { color: colors.mutedForeground }]}>
                Approvals update the guard-side status in real time.
              </Text>
            </View>
            {visitor.rejectionReason ? (
              <View style={styles.inlineMeta}>
                <ShieldX color={colors.destructive} size={16} />
                <Text style={[styles.copy, { color: colors.mutedForeground }]}>
                  {visitor.rejectionReason}
                </Text>
              </View>
            ) : null}
          </InfoCard>
        ))
      ) : (
        <InfoCard>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>No pending entries</Text>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            Fresh gate approvals will appear here as soon as the guard desk creates them.
          </Text>
        </InfoCard>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  copy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  message: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  visitorHeading: {
    flex: 1,
    gap: Spacing.xs,
  },
  visitorName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius['2xl'],
  },
  metaRow: {
    gap: Spacing.sm,
  },
  metaText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  actionGroup: {
    gap: Spacing.base,
  },
  inlineMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
