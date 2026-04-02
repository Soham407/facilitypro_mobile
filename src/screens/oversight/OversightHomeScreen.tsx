import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { AlertTriangle, ClipboardList, ShieldCheck, Users } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { StatusChip } from '../../components/guard/StatusChip';
import { LiveGuardBoard } from '../../components/oversight/LiveGuardBoard';
import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { NotificationInboxCard } from '../../components/shared/NotificationInboxCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  fetchOversightAlertFeed,
  fetchOversightLiveGuards,
  fetchOversightVisitorStats,
  isPreviewProfile,
} from '../../lib/mobileBackend';
import type { OversightTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useOversightStore } from '../../store/useOversightStore';

type OversightHomeScreenProps = BottomTabScreenProps<OversightTabParamList, 'OversightHome'>;

const ROLE_COPY = {
  security_supervisor: {
    eyebrow: 'Security Supervision',
    title: 'Operations Control Room',
    description:
      'Track guard movement, active alerts, and shift compliance from one mobile command view.',
  },
  society_manager: {
    eyebrow: 'Society Management',
    title: 'Site Oversight Hub',
    description:
      'Monitor staff discipline, visitor flow, and unresolved incidents across the property.',
  },
} as const;

function formatValue(value: string | null) {
  if (!value) {
    return 'Not yet';
  }

  return new Date(value).toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

export function OversightHomeScreen(_props: OversightHomeScreenProps) {
  const { colors } = useAppTheme();
  const signOut = useAppStore((state) => state.signOut);
  const profile = useAppStore((state) => state.profile);
  const previewMode = isPreviewProfile(profile);
  const role = profile?.role === 'society_manager' ? 'society_manager' : 'security_supervisor';
  const previewGuards = useOversightStore((state) => state.guards);
  const previewAlerts = useOversightStore((state) => state.alerts);
  const previewVisitorStats = useOversightStore((state) => state.visitorStats);
  const previewTickets = useOversightStore((state) => state.tickets);
  const previewRefreshedAt = useOversightStore((state) => state.refreshedAt);
  const refreshPreviewFeed = useOversightStore((state) => state.refreshFeed);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const guardsQuery = useQuery({
    queryKey: ['oversight', 'live-guards', profile?.userId],
    queryFn: fetchOversightLiveGuards,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 60000,
  });

  const alertsQuery = useQuery({
    queryKey: ['oversight', 'alerts', profile?.userId],
    queryFn: fetchOversightAlertFeed,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 30000,
  });

  const visitorStatsQuery = useQuery({
    queryKey: ['oversight', 'visitor-stats', profile?.userId],
    queryFn: fetchOversightVisitorStats,
    enabled: Boolean(profile?.userId) && !previewMode,
    refetchInterval: 60000,
  });

  const copy = ROLE_COPY[role];
  const guards = previewMode ? previewGuards : guardsQuery.data ?? [];
  const alerts = previewMode ? previewAlerts : alertsQuery.data ?? [];
  const visitorStats = previewMode ? previewVisitorStats : visitorStatsQuery.data ?? [];
  const refreshedAt = previewMode
    ? previewRefreshedAt
    : [guardsQuery.dataUpdatedAt, alertsQuery.dataUpdatedAt, visitorStatsQuery.dataUpdatedAt]
        .filter(Boolean)
        .sort()
        .at(-1)
        ? new Date(
            [guardsQuery.dataUpdatedAt, alertsQuery.dataUpdatedAt, visitorStatsQuery.dataUpdatedAt]
              .filter(Boolean)
              .sort()
              .at(-1) as number,
          ).toISOString()
        : null;

  const guardsOnDuty = useMemo(
    () => guards.filter((guard) => guard.status === 'on_duty' || guard.status === 'breach').length,
    [guards],
  );
  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status !== 'resolved').length,
    [alerts],
  );
  const checklistPercent = useMemo(() => {
    const total = guards.reduce((sum, guard) => sum + guard.checklistTotal, 0);
    const completed = guards.reduce((sum, guard) => sum + guard.checklistCompleted, 0);

    if (!total) {
      return 0;
    }

    return Math.round((completed / total) * 100);
  }, [guards]);
  const visitorsToday = useMemo(
    () => visitorStats.reduce((sum, gate) => sum + gate.visitorsToday, 0),
    [visitorStats],
  );
  const openTickets = previewMode
    ? previewTickets.filter((ticket) => ticket.status !== 'closed').length
    : 0;
  const attentionItems = useMemo(
    () =>
      guards.filter(
        (guard) =>
          guard.status === 'breach' ||
          guard.status === 'offline' ||
          guard.checklistCompleted < guard.checklistTotal,
      ),
    [guards],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);

    try {
      if (previewMode) {
        await refreshPreviewFeed();
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['oversight', 'live-guards', profile?.userId] }),
          queryClient.invalidateQueries({ queryKey: ['oversight', 'alerts', profile?.userId] }),
          queryClient.invalidateQueries({ queryKey: ['oversight', 'visitor-stats', profile?.userId] }),
        ]);
      }

      setMessage(
        previewMode
          ? 'Preview oversight feed refreshed.'
          : 'Live oversight feed refreshed from backend summaries.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <ScreenShell eyebrow={copy.eyebrow} title={copy.title} description={copy.description}>
      <InfoCard>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {role === 'security_supervisor'
                ? 'Shift status is live'
                : 'Operations are visible at a glance'}
            </Text>
            <Text style={[styles.heroText, { color: colors.mutedForeground }]}>
              Last refresh: {formatValue(refreshedAt)}
            </Text>
          </View>
          <StatusChip
            label={activeAlerts ? `${activeAlerts} live alerts` : 'All clear'}
            tone={activeAlerts ? 'danger' : 'success'}
          />
        </View>
        {message ? <Text style={[styles.heroText, { color: colors.primary }]}>{message}</Text> : null}
        <View style={styles.actionGroup}>
          <ActionButton
            label={isRefreshing ? 'Refreshing...' : 'Refresh feed'}
            loading={isRefreshing}
            onPress={() => void handleRefresh()}
          />
          <ActionButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </InfoCard>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<Users color={colors.primary} size={20} />}
            label="Guards on site"
            value={String(guardsOnDuty)}
            caption={`${guards.length} total assigned guards`}
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<AlertTriangle color={colors.destructive} size={20} />}
            label="Open alerts"
            value={String(activeAlerts)}
            caption="Panic, inactivity, and geo-fence issues"
          />
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ClipboardList color={colors.info} size={20} />}
            label="Checklist rate"
            value={`${checklistPercent}%`}
            caption="Completion across active guards"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ShieldCheck color={colors.warning} size={20} />}
            label="Visitors today"
            value={String(visitorsToday)}
            caption={
              previewMode
                ? `${openTickets} active issue tickets`
                : 'Realtime visitor stats from society gates'
            }
          />
        </View>
      </View>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live guard location board</Text>
        <Text style={[styles.heroText, { color: colors.mutedForeground }]}>
          {previewMode
            ? 'Preview mode approximates the active site map.'
            : 'This board is driven by the latest guard position data from the backend oversight feed.'}
        </Text>
        <LiveGuardBoard guards={guards} />
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Needs attention</Text>
        {attentionItems.length ? (
          attentionItems.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.alertRow}>
              <View style={styles.alertCopy}>
                <Text style={[styles.alertTitle, { color: colors.foreground }]}>{item.guardName}</Text>
                <Text style={[styles.heroText, { color: colors.mutedForeground }]}>
                  {item.assignedLocationName} - {item.checklistCompleted}/{item.checklistTotal}{' '}
                  checklist items
                </Text>
              </View>
              <StatusChip
                label={item.status.replace(/_/g, ' ')}
                tone={
                  item.status === 'on_duty'
                    ? 'success'
                    : item.status === 'offline'
                      ? 'warning'
                      : 'danger'
                }
              />
            </View>
          ))
        ) : (
          <Text style={[styles.heroText, { color: colors.mutedForeground }]}>
            Nothing critical is waiting for supervisor review right now.
          </Text>
        )}
      </InfoCard>

      <NotificationInboxCard
        title="Control-room notifications"
        description={
          previewMode
            ? 'Preview routes still work here for local demo validation.'
            : 'This inbox now mirrors the live backend notification table and Realtime delivery feed.'
        }
        actions={
          previewMode
            ? [
                {
                  label: 'Preview SOS alert',
                  route: 'sos_alert',
                  variant: 'secondary',
                },
                {
                  label: 'Preview inactivity alert',
                  route: 'inactivity_alert',
                  variant: 'ghost',
                },
                {
                  label: 'Preview low stock alert',
                  route: 'low_stock_alert',
                  variant: 'ghost',
                },
              ]
            : []
        }
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  heroTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 30,
  },
  heroText: {
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
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  alertRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  alertCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  alertTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
});
