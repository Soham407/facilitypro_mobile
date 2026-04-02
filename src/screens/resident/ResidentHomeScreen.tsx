import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { BellRing, Clock3, DoorOpen } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchResidentPendingVisitors } from '../../lib/mobileBackend';
import type { ResidentTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';

type ResidentHomeScreenProps = BottomTabScreenProps<ResidentTabParamList, 'ResidentHome'>;

function formatTime(value: string | null) {
  if (!value) {
    return 'No pending approvals';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResidentHomeScreen({ navigation }: ResidentHomeScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const firstName = profile?.fullName?.split(' ')[0] ?? 'Resident';

  const visitorsQuery = useQuery({
    queryKey: ['resident', 'pending-visitors', profile?.userId],
    queryFn: fetchResidentPendingVisitors,
    enabled: Boolean(profile?.userId),
    refetchInterval: 15000,
  });

  const pendingVisitors = useMemo(
    () =>
      (visitorsQuery.data ?? []).filter(
        (visitor) => visitor.approvalStatus === 'pending',
      ),
    [visitorsQuery.data],
  );
  const nextDeadline = pendingVisitors
    .map((visitor) => visitor.approvalDeadlineAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const frequentVisitors = useMemo(
    () => (visitorsQuery.data ?? []).filter((visitor) => visitor.isFrequentVisitor).length,
    [visitorsQuery.data],
  );

  return (
    <ScreenShell
      eyebrow="Resident Access"
      title={`Gate decisions for ${firstName}`}
      description="Approve visitors quickly, keep trusted entries marked as frequent, and review safety alerts without leaving the resident app."
    >
      <InfoCard>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>
          Gate approval inbox is live
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Your resident flow is now connected to live guard entries instead of demo-only previews.
        </Text>
        <View style={styles.actionGroup}>
          <ActionButton
            label="Open pending approvals"
            onPress={() => navigation.navigate('ResidentApprovals')}
          />
          <ActionButton
            label="Open alert history"
            variant="secondary"
            onPress={() => navigation.navigate('ResidentNotifications')}
          />
        </View>
      </InfoCard>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<DoorOpen color={colors.primary} size={20} />}
            label="Waiting approvals"
            value={String(pendingVisitors.length)}
            caption="Visitors currently waiting at the gate"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<Clock3 color={colors.warning} size={20} />}
            label="Next decision"
            value={formatTime(nextDeadline)}
            caption="30-second resident approval window"
          />
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<BellRing color={colors.info} size={20} />}
            label="Frequent visitors"
            value={String(frequentVisitors)}
            caption="Trusted visitors remembered for faster decisions"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<DoorOpen color={colors.success} size={20} />}
            label="Today in inbox"
            value={String(visitorsQuery.data?.length ?? 0)}
            caption="Resident-facing gate entries loaded from backend"
          />
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 30,
  },
  copy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionGroup: {
    gap: Spacing.base,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  metricCell: {
    flex: 1,
  },
});
