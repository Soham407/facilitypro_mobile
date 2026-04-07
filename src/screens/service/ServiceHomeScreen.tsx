import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ClipboardList, MapPin, Package, ShieldCheck } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { NotificationInboxCard } from '../../components/shared/NotificationInboxCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  calculateDistanceMeters,
  getCurrentLocationFix,
  requestGeoFencePermissions,
} from '../../lib/location';
import { capturePhoto } from '../../lib/media';
import type { ServiceTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { getOrderedServiceTasks, useServiceStore } from '../../store/useServiceStore';
import type { ServiceLocationSnapshot, ServiceRole, ServiceTaskRecord } from '../../types/service';

type ServiceHomeScreenProps = BottomTabScreenProps<ServiceTabParamList, 'ServiceHome'>;

function formatTimestamp(value: string | null) {
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

function getRoleTitle(role: ServiceRole) {
  switch (role) {
    case 'ac_technician':
      return 'AC Technician';
    case 'pest_control_technician':
      return 'Pest Control';
    case 'delivery_boy':
      return 'Delivery';
    default:
      return 'Service Operations';
  }
}

function getRoleDescription(role: ServiceRole) {
  switch (role) {
    case 'ac_technician':
      return 'Receive service requests, capture before and after proof, and close work orders from the field.';
    case 'pest_control_technician':
      return 'Complete PPE gating, track chemical requests, and upload treatment proof without leaving the service lane.';
    case 'delivery_boy':
      return 'Run pickup-to-delivery status changes and attach destination proof from a single mobile workspace.';
    default:
      return 'Manage assigned tasks, keep attendance current, and close site-service work directly from the mobile app.';
  }
}

function getStatusTone(task: ServiceTaskRecord | null) {
  if (!task) {
    return 'default';
  }

  if (task.status === 'completed' || task.status === 'delivered') {
    return 'success';
  }

  if (task.status === 'awaiting_material') {
    return 'warning';
  }

  return 'info';
}

function getTodayCount(values: Array<{ completedAt: string | null }>) {
  const today = new Date().toDateString();
  return values.filter((value) => value.completedAt && new Date(value.completedAt).toDateString() === today)
    .length;
}

export function ServiceHomeScreen({ navigation }: ServiceHomeScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const signOut = useAppStore((state) => state.signOut);
  const role = useServiceStore((state) => state.role);
  const dutyStatus = useServiceStore((state) => state.dutyStatus);
  const lastKnownLocation = useServiceStore((state) => state.lastKnownLocation);
  const lastSyncAt = useServiceStore((state) => state.lastSyncAt);
  const attendanceLog = useServiceStore((state) => state.attendanceLog);
  const tasks = useServiceStore((state) => state.tasks);
  const materialRequests = useServiceStore((state) => state.materialRequests);
  const ppeChecklist = useServiceStore((state) => state.ppeChecklist);
  const refreshWorkspace = useServiceStore((state) => state.refreshWorkspace);
  const rememberLocation = useServiceStore((state) => state.rememberLocation);
  const checkInWithSelfie = useServiceStore((state) => state.checkInWithSelfie);
  const checkOutWithSelfie = useServiceStore((state) => state.checkOutWithSelfie);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const orderedTasks = useMemo(() => getOrderedServiceTasks(tasks), [tasks]);
  const activeTasks = useMemo(
    () =>
      orderedTasks.filter((task) => task.status !== 'completed' && task.status !== 'delivered'),
    [orderedTasks],
  );
  const nextTask = activeTasks[0] ?? null;
  const completedTodayCount = useMemo(() => getTodayCount(tasks), [tasks]);
  const pendingApprovals = useMemo(
    () => materialRequests.filter((request) => request.status === 'pending_approval').length,
    [materialRequests],
  );
  const deliveryProofPendingCount = useMemo(
    () => activeTasks.filter((task) => task.taskType === 'delivery' && !task.deliveryProofUri).length,
    [activeTasks],
  );
  const attendanceCount = attendanceLog.length;
  const ppeProgress = useMemo(() => {
    if (!ppeChecklist.length) {
      return null;
    }

    const checkedCount = ppeChecklist.filter((item) => item.checked).length;
    return `${checkedCount}/${ppeChecklist.length}`;
  }, [ppeChecklist]);

  async function buildLocationSnapshot() {
    const permissions = await requestGeoFencePermissions();

    if (!permissions.foregroundGranted) {
      throw new Error('Location access is required for service attendance and task proof.');
    }

    const fix = await getCurrentLocationFix();
    const assignedLocation = profile?.assignedLocation;

    let distanceFromAssignedSite: number | null = null;
    let withinGeoFence = true;

    if (assignedLocation?.latitude != null && assignedLocation.longitude != null) {
      distanceFromAssignedSite = calculateDistanceMeters(
        fix.coords.latitude,
        fix.coords.longitude,
        assignedLocation.latitude,
        assignedLocation.longitude,
      );
      withinGeoFence = distanceFromAssignedSite <= assignedLocation.geoFenceRadius;
    }

    const snapshot: ServiceLocationSnapshot = {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      capturedAt: new Date().toISOString(),
      distanceFromAssignedSite,
      withinGeoFence,
    };

    await rememberLocation(snapshot);
    return snapshot;
  }

  const handleRefreshWorkspace = async () => {
    setIsBusy(true);
    setMessage(null);

    try {
      const location = await buildLocationSnapshot();
      await refreshWorkspace();
      setMessage(
        pendingApprovals
          ? `Workspace refreshed. ${pendingApprovals} pending approval item${pendingApprovals === 1 ? '' : 's'} moved forward locally.`
          : location.distanceFromAssignedSite == null
            ? 'Workspace refreshed and live location captured.'
            : `Workspace refreshed. You are ${location.distanceFromAssignedSite}m from the assigned site.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh the service workspace.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAttendance = async () => {
    setIsBusy(true);
    setMessage(null);

    try {
      const location = await buildLocationSnapshot();
      const photo = await capturePhoto({
        cameraType: 'front',
        aspect: [1, 1],
      });

      if (!photo) {
        setMessage('Attendance capture was cancelled before the selfie was saved.');
        return;
      }

      if (dutyStatus === 'off_duty' && !location.withinGeoFence) {
        setMessage(
          location.distanceFromAssignedSite == null
            ? 'Move closer to the assigned site before checking in.'
            : `You are ${location.distanceFromAssignedSite}m away. Move inside the geo-fence to check in.`,
        );
        return;
      }

      if (dutyStatus === 'off_duty') {
        await checkInWithSelfie({
          location,
          photoUri: photo.uri,
        });
        setMessage('Service attendance captured. You are ready to start field work.');
      } else {
        await checkOutWithSelfie({
          location,
          photoUri: photo.uri,
        });
        setMessage('Shift closed successfully from the mobile service workspace.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Attendance could not be completed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <ScreenShell
      eyebrow="Phase 5"
      title={`${getRoleTitle(role)} workspace`}
      description={getRoleDescription(role)}
    >
      <InfoCard>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <StatusChip
              label={dutyStatus === 'on_duty' ? 'On duty' : 'Off duty'}
              tone={dutyStatus === 'on_duty' ? 'success' : 'default'}
            />
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {profile?.assignedLocation?.locationName ?? 'Assigned site pending'}
            </Text>
          </View>
          <StatusChip
            label={nextTask ? nextTask.status.replace(/_/g, ' ') : 'Queue clear'}
            tone={getStatusTone(nextTask)}
          />
        </View>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Employee code: {profile?.employeeCode ?? 'Pending'} | Last sync {formatTimestamp(lastSyncAt)}
        </Text>
        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
        <View style={styles.actionStack}>
          <ActionButton
            label={dutyStatus === 'on_duty' ? 'Check out with selfie' : 'Check in with selfie'}
            loading={isBusy}
            onPress={() => void handleAttendance()}
          />
          <ActionButton
            label="Refresh workspace"
            variant="secondary"
            disabled={isBusy}
            onPress={() => void handleRefreshWorkspace()}
          />
        </View>
      </InfoCard>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ClipboardList color={colors.info} size={20} />}
            label="Open tasks"
            value={String(activeTasks.length)}
            caption="Assigned items still in the field queue"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ShieldCheck color={colors.success} size={20} />}
            label="Completed today"
            value={String(completedTodayCount)}
            caption="Tasks closed during this shift window"
          />
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<Package color={colors.warning} size={20} />}
            label={role === 'delivery_boy' ? 'Dispatch notes' : 'Materials'}
            value={String(role === 'delivery_boy' ? deliveryProofPendingCount : pendingApprovals)}
            caption={
              role === 'delivery_boy'
                ? 'Live items waiting for delivery proof'
                : 'Requests waiting on local approval'
            }
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<MapPin color={colors.primary} size={20} />}
            label={ppeProgress ? 'PPE ready' : 'Attendance'}
            value={ppeProgress ?? String(attendanceCount)}
            caption={
              ppeProgress
                ? 'Required safety checks completed'
                : 'Selfie attendance actions recorded'
            }
          />
        </View>
      </View>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Next action</Text>
        {nextTask ? (
          <>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{nextTask.title}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              {nextTask.referenceCode} | {nextTask.locationName}
            </Text>
            <Text style={[styles.caption, { color: colors.foreground }]}>{nextTask.description}</Text>
            {nextTask.notes ? (
              <Text style={[styles.caption, { color: colors.foreground }]}>{nextTask.notes}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            No active service task is waiting right now. The queue will repopulate here as new work orders arrive.
          </Text>
        )}
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Location + quick actions</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Latest snapshot: {formatTimestamp(lastKnownLocation?.capturedAt ?? null)}
        </Text>
        <Text style={[styles.caption, { color: colors.foreground }]}>
          {lastKnownLocation?.distanceFromAssignedSite == null
            ? 'No live distance captured yet.'
            : `${lastKnownLocation.distanceFromAssignedSite}m from the assigned service site`}
        </Text>
        <View style={styles.actionStack}>
          <ActionButton
            label="Open task board"
            variant="secondary"
            onPress={() => navigation.navigate('ServiceTasks')}
          />
          <ActionButton
            label={role === 'delivery_boy' ? 'Open proof lane' : 'Open materials'}
            variant="ghost"
            onPress={() =>
              navigation.navigate(role === 'delivery_boy' ? 'ServiceProof' : 'ServiceMaterials')
            }
          />
          <ActionButton
            label="My payslips"
            variant="ghost"
            onPress={() => navigation.navigate('ServiceStaff', { screen: 'HrmsPayslips' })}
          />
          <ActionButton
            label="My documents"
            variant="ghost"
            onPress={() => navigation.navigate('ServiceStaff', { screen: 'HrmsDocuments' })}
          />
          <ActionButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </InfoCard>

      {role === 'pest_control_technician' ? (
        <NotificationInboxCard
          title="Resident advisory lane"
          description="Phase 7 previews the resident-facing pest-control notification route from the technician workspace."
          actions={[
            {
              label: 'Preview pest control alert',
              route: 'pest_control_alert',
              variant: 'secondary',
            },
          ]}
        />
      ) : null}
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
    gap: Spacing.sm,
  },
  heroTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 28,
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
  actionStack: {
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
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
});
