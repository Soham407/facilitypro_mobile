import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AlertTriangle, ClipboardList, MapPin, ShieldAlert, Users } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { NotificationInboxCard } from '../../components/shared/NotificationInboxCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { capturePhoto } from '../../lib/media';
import {
  fetchGuardVisitors,
  fetchPanicAlertStatus,
  isPreviewProfile,
  streamPanicAlertLocation,
} from '../../lib/mobileBackend';
import {
  calculateDistanceMeters,
  getCurrentLocationFix,
  requestGeoFencePermissions,
} from '../../lib/location';
import { consumePendingInactivitySos } from '../../lib/patrolTask';
import type { GuardTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useGuardStore } from '../../store/useGuardStore';
import type { GuardLocationSnapshot } from '../../types/guard';

type GuardHomeScreenProps = BottomTabScreenProps<GuardTabParamList, 'GuardHome'>;

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

function getTodayCount(values: Array<{ recordedAt: string }>) {
  const today = new Date().toDateString();
  return values.filter((value) => new Date(value.recordedAt).toDateString() === today).length;
}

export function GuardHomeScreen({ navigation }: GuardHomeScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const dutyStatus = useGuardStore((state) => state.dutyStatus);
  const isOfflineMode = useGuardStore((state) => state.isOfflineMode);
  const isNetworkOnline = useGuardStore((state) => state.isNetworkOnline);
  const offlineQueue = useGuardStore((state) => state.offlineQueue);
  const lastSyncAt = useGuardStore((state) => state.lastSyncAt);
  const attendanceLog = useGuardStore((state) => state.attendanceLog);
  const visitorLog = useGuardStore((state) => state.visitorLog);
  const sosEvents = useGuardStore((state) => state.sosEvents);
  const lastPatrolResetAt = useGuardStore((state) => state.lastPatrolResetAt);
  const lastKnownLocation = useGuardStore((state) => state.lastKnownLocation);
  const setOfflineMode = useGuardStore((state) => state.setOfflineMode);
  const rememberLocation = useGuardStore((state) => state.rememberLocation);
  const hydrateVisitorLog = useGuardStore((state) => state.hydrateVisitorLog);
  const clockIn = useGuardStore((state) => state.clockIn);
  const clockOut = useGuardStore((state) => state.clockOut);
  const triggerSos = useGuardStore((state) => state.triggerSos);
  const resetPatrolClock = useGuardStore((state) => state.resetPatrolClock);
  const flushOfflineQueue = useGuardStore((state) => state.flushOfflineQueue);
  const signOut = useAppStore((state) => state.signOut);
  const previewMode = isPreviewProfile(profile);
  const useLocalQueueFlow = previewMode || isOfflineMode || !isNetworkOnline;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const sosCameraRef = useRef<CameraView | null>(null);
  const hasCapturedSosRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSosCaptureOpen, setIsSosCaptureOpen] = useState(false);
  const [isCapturingSos, setIsCapturingSos] = useState(false);
  const [pendingSosLocation, setPendingSosLocation] = useState<GuardLocationSnapshot | null>(
    null,
  );
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const warningShownRef = useRef(false);
  const checkCounterRef = useRef(0);

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

  const pendingVisitors = useMemo(
    () =>
      useLocalQueueFlow
        ? visitorLog.filter((entry) => entry.status === 'inside').length
        : (visitorsQuery.data ?? []).filter((entry) => entry.status === 'inside').length,
    [useLocalQueueFlow, visitorLog, visitorsQuery.data],
  );

  const recentSosCount = useMemo(() => getTodayCount(sosEvents), [sosEvents]);
  const attendanceCount = useMemo(() => getTodayCount(attendanceLog), [attendanceLog]);
  const latestGuardEvidencePhotoUri = useMemo(
    () => attendanceLog.find((entry) => entry.photoUri)?.photoUri ?? profile?.employeePhotoUrl ?? null,
    [attendanceLog, profile?.employeePhotoUrl],
  );
  const activeSosEvent = useMemo(
    () => sosEvents.find((event) => event.streamingActive && event.panicAlertId) ?? null,
    [sosEvents],
  );

  function createLocationSnapshot(latitude: number, longitude: number): GuardLocationSnapshot {
    const assignedLocation = useAppStore.getState().profile?.assignedLocation;

    let distanceFromAssignedSite: number | null = null;
    let withinGeoFence = true;

    if (assignedLocation?.latitude != null && assignedLocation.longitude != null) {
      distanceFromAssignedSite = calculateDistanceMeters(
        latitude,
        longitude,
        assignedLocation.latitude,
        assignedLocation.longitude,
      );
      withinGeoFence = distanceFromAssignedSite <= assignedLocation.geoFenceRadius;
    }

    return {
      latitude,
      longitude,
      capturedAt: new Date().toISOString(),
      distanceFromAssignedSite,
      withinGeoFence,
    };
  }

  async function buildLocationSnapshot() {
    const permissions = await requestGeoFencePermissions();

    if (!permissions.foregroundGranted) {
      throw new Error('Location access is required for guard attendance and SOS capture.');
    }

    const fix = await getCurrentLocationFix();
    const snapshot = createLocationSnapshot(fix.coords.latitude, fix.coords.longitude);

    await rememberLocation(snapshot);
    return snapshot;
  }

  const handleRefreshLocation = async () => {
    setIsBusy(true);
    setMessage(null);

    try {
      const location = await buildLocationSnapshot();
      setMessage(
        location.distanceFromAssignedSite == null
          ? 'Live location refreshed.'
          : `Live location refreshed. You are ${location.distanceFromAssignedSite}m from the assigned site.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh the live location.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDutyAction = async () => {
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
            ? 'Move closer to the assigned site before clocking in.'
            : `You are ${location.distanceFromAssignedSite}m away. Move inside the geo-fence to clock in.`,
        );
        return;
      }

      const result =
        dutyStatus === 'off_duty'
          ? await clockIn({
              location,
              photoUri: photo.uri,
            })
          : await clockOut({
              location,
              photoUri: photo.uri,
            });

      setMessage(
        dutyStatus === 'off_duty'
          ? result.queued
            ? 'Clock-in captured offline. It will sync when the app is back online.'
            : 'Shift started successfully.'
          : result.queued
            ? 'Clock-out saved offline. It will sync when connectivity returns.'
            : 'Shift closed successfully.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Attendance could not be completed.');
    } finally {
      setIsBusy(false);
    }
  };

  const closeSosCapture = () => {
    hasCapturedSosRef.current = false;
    setIsCapturingSos(false);
    setIsSosCaptureOpen(false);
    setPendingSosLocation(null);
  };

  const cancelSosCapture = () => {
    closeSosCapture();
    setMessage('SOS capture was cancelled before evidence was recorded.');
    setIsBusy(false);
  };

  const handlePatrolReset = async () => {
    await resetPatrolClock();
    setShowInactivityWarning(false);
    warningShownRef.current = false;
  };

  const submitSosAlert = async (options: {
    location: GuardLocationSnapshot;
    note: string;
    photoUri: string;
  }) => {
    const result = await triggerSos({
      alertType: 'panic',
      note: options.note,
      location: options.location,
      photoUri: options.photoUri,
    });

    setMessage(
      useLocalQueueFlow && result.queued
        ? 'SOS recorded offline with photo evidence. It is waiting in the sync queue.'
        : 'SOS alert recorded with live location and sent into the supervisor escalation flow.',
    );
  };

  useEffect(() => {
    const handleForegroundRecovery = (nextState: string) => {
      if (nextState !== 'active' || useGuardStore.getState().dutyStatus !== 'on_duty') {
        return;
      }

      void (async () => {
        const pending = await consumePendingInactivitySos();

        if (!pending) {
          return;
        }

        try {
          const snapshot = createLocationSnapshot(pending.latitude, pending.longitude);
          const guardState = useGuardStore.getState();
          await guardState.rememberLocation(snapshot);
          await guardState.triggerSos({
            alertType: 'inactivity',
            note: 'Auto-inactivity: no patrol movement detected for 30 minutes.',
            location: snapshot,
            photoUri: null,
          });
        } catch {
          // Leave the UI quiet if the automatic recovery flow cannot complete.
        }
      })();
    };

    handleForegroundRecovery(AppState.currentState);
    const subscription = AppState.addEventListener('change', handleForegroundRecovery);

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (dutyStatus !== 'on_duty') {
      warningShownRef.current = false;
      checkCounterRef.current = 0;
      setShowInactivityWarning(false);
      return;
    }

    warningShownRef.current = false;
    checkCounterRef.current = 0;

    const intervalId = setInterval(() => {
      void (async () => {
        checkCounterRef.current += 1;
        const currentProfile = useAppStore.getState().profile;

        if (checkCounterRef.current % 5 === 0 && !isPreviewProfile(currentProfile)) {
          try {
            const fix = await getCurrentLocationFix();
            const snapshot = createLocationSnapshot(fix.coords.latitude, fix.coords.longitude);
            await useGuardStore.getState().updatePatrolLocation(snapshot);
          } catch {
            // If GPS is unavailable we still allow manual patrol resets to keep working.
          }
        }

        const guardState = useGuardStore.getState();
        const elapsed = guardState.lastPatrolResetAt
          ? Date.now() - new Date(guardState.lastPatrolResetAt).getTime()
          : 0;

        if (elapsed < 25 * 60 * 1000 && warningShownRef.current) {
          warningShownRef.current = false;
          setShowInactivityWarning(false);
        }

        if (elapsed >= 30 * 60 * 1000) {
          try {
            await guardState.triggerSos({
              alertType: 'inactivity',
              note: 'Auto-inactivity: no patrol movement detected for 30 minutes.',
              location: guardState.lastKnownLocation,
              photoUri: null,
            });
            await guardState.resetPatrolClock();
            setShowInactivityWarning(false);
            warningShownRef.current = false;
          } catch {
            // Avoid interrupting the shift UI if the auto-SOS request cannot be sent.
          }
          return;
        }

        if (elapsed >= 25 * 60 * 1000 && !warningShownRef.current) {
          warningShownRef.current = true;
          Vibration.vibrate([500, 200, 500, 200, 500]);
          setShowInactivityWarning(true);
        }
      })();
    }, 60_000);

    return () => {
      clearInterval(intervalId);
      warningShownRef.current = false;
      checkCounterRef.current = 0;
    };
  }, [dutyStatus]);

  useEffect(() => {
    if (!activeSosEvent?.panicAlertId || isPreviewProfile(useAppStore.getState().profile)) {
      return;
    }

    const alertId = activeSosEvent.panicAlertId;
    const eventId = activeSosEvent.id;
    const streamLocation = () => {
      void (async () => {
        try {
          const fix = await getCurrentLocationFix();
          const snapshot = createLocationSnapshot(fix.coords.latitude, fix.coords.longitude);
          const guardState = useGuardStore.getState();
          await guardState.rememberLocation(snapshot);
          await streamPanicAlertLocation(alertId, snapshot);

          const status = await fetchPanicAlertStatus(alertId);
          if (status === 'resolved') {
            await guardState.stopSosStreaming(eventId);
          }
        } catch {
          // Keep the best-effort location stream quiet during temporary failures.
        }
      })();
    };

    streamLocation();
    const intervalId = setInterval(streamLocation, 30_000);

    return () => clearInterval(intervalId);
  }, [activeSosEvent?.id, activeSosEvent?.panicAlertId]);

  const [activeSosEventId, setActiveSosEventId] = useState<string | null>(null);

  const handleTriggerSos = async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      const location = await buildLocationSnapshot();
      setPendingSosLocation(location);

      const result = await triggerSos({
        alertType: 'panic',
        note: 'Guard manually triggered the panic workflow. Photo evidence capture is pending.',
        location,
        photoUri: null,
      });

      setMessage(
        useLocalQueueFlow && result.queued
          ? 'SOS recorded offline. Opening camera for evidence.'
          : 'SOS alert recorded with live location. Opening camera for evidence.'
      );
      
      setActiveSosEventId(result.eventId);

      const permission =
        cameraPermission?.granted === true
          ? cameraPermission
          : await requestCameraPermission();

      if (!permission.granted) {
        if (!latestGuardEvidencePhotoUri) {
          throw new Error('Camera access is required to auto-capture SOS evidence.');
        }

        await useGuardStore.getState().attachSosEvidence(result.eventId, latestGuardEvidencePhotoUri);
        setPendingSosLocation(null);
        setActiveSosEventId(null);
        setIsBusy(false);
        return;
      }

      setIsSosCaptureOpen(true);
    } catch (error) {
      setPendingSosLocation(null);
      setActiveSosEventId(null);
      setMessage(error instanceof Error ? error.message : 'SOS alert could not be created.');
      setIsBusy(false);
    }
  };

  const handleSosCameraReady = async () => {
    if (hasCapturedSosRef.current || !pendingSosLocation || !activeSosEventId) {
      return;
    }

    hasCapturedSosRef.current = true;
    setIsCapturingSos(true);

    try {
      const capturedPhoto = await sosCameraRef.current?.takePictureAsync({
        quality: 0.65,
        shutterSound: false,
      });

      const photoUri = capturedPhoto?.uri ?? latestGuardEvidencePhotoUri;

      if (!photoUri) {
        throw new Error('SOS evidence could not be captured. Please allow camera access first.');
      }

      await useGuardStore.getState().attachSosEvidence(activeSosEventId, photoUri);
      setMessage('SOS evidence attached successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SOS alert could not be created.');
    } finally {
      closeSosCapture();
      setIsBusy(false);
      setActiveSosEventId(null);
    }
  };

  const handleSosCameraMountError = async (messageText?: string) => {
    try {
      if (!pendingSosLocation || !latestGuardEvidencePhotoUri || !activeSosEventId) {
        throw new Error(messageText || 'SOS camera could not start.');
      }

      await useGuardStore.getState().attachSosEvidence(activeSosEventId, latestGuardEvidencePhotoUri);
      setMessage('SOS fallback evidence attached successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SOS alert could not be created.');
    } finally {
      closeSosCapture();
      setIsBusy(false);
      setActiveSosEventId(null);
    }
  };

  const handleSyncQueue = async () => {
    setIsSyncing(true);
    setMessage(null);

    try {
      const syncedCount = await flushOfflineQueue();
      const remainingCount = useGuardStore.getState().offlineQueue.length;
      setMessage(
        syncedCount
          ? remainingCount
            ? `Replayed ${syncedCount} queued action${syncedCount === 1 ? '' : 's'}. ${remainingCount} still need a live backend path or another retry.`
            : `Replayed ${syncedCount} queued action${syncedCount === 1 ? '' : 's'} successfully.`
          : remainingCount
            ? 'Queued actions are still waiting for a live connection or a replayable backend contract.'
            : 'Nothing is waiting in the offline queue.',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const firstName = profile?.fullName?.split(' ')[0] ?? 'Guard';
  const geoStatusTone = lastKnownLocation?.withinGeoFence ? 'success' : 'warning';

  return (
    <ScreenShell
      eyebrow="Security Guard"
      title={`Ready for duty, ${firstName}`}
      description="Use this workspace to manage SOS, selfie attendance, patrol resets, and the day-to-day gate workflow."
    >
      <InfoCard>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleWrap}>
            <StatusChip
              label={dutyStatus === 'on_duty' ? 'On duty' : 'Off duty'}
              tone={dutyStatus === 'on_duty' ? 'success' : 'default'}
            />
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {profile?.assignedLocation?.locationName ?? 'Assigned site pending'}
            </Text>
          </View>
          <StatusChip
            label={
              isOfflineMode
                ? 'Offline test mode'
                : !isNetworkOnline
                  ? 'Offline'
                  : 'Live sync'
            }
            tone={isOfflineMode || !isNetworkOnline ? 'warning' : 'info'}
          />
        </View>
        <Text style={[styles.heroCaption, { color: colors.mutedForeground }]}>
          Employee code: {profile?.employeeCode ?? 'Pending'} - Last patrol reset:{' '}
          {formatTimestamp(lastPatrolResetAt)}
        </Text>
        {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
        <View style={styles.heroActions}>
          <ActionButton
            label={dutyStatus === 'on_duty' ? 'Selfie clock out' : 'Selfie clock in'}
            loading={isBusy}
            onPress={() => void handleDutyAction()}
          />
          <ActionButton
            label="Refresh location"
            variant="secondary"
            disabled={isBusy}
            onPress={() => void handleRefreshLocation()}
          />
        </View>
      </InfoCard>

      {showInactivityWarning ? (
        <View
          style={[
            styles.inactivityWarning,
            {
              backgroundColor: colors.warning,
              borderColor: colors.warning,
            },
          ]}
        >
          <AlertTriangle color={colors.warningForeground} size={20} />
          <Text style={[styles.inactivityWarningText, { color: colors.warningForeground }]}>
            Inactivity warning - SOS will be sent in 5 minutes. Press "I am on duty" to reset.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => void handleTriggerSos()}
        style={[
          styles.sosCard,
          {
            backgroundColor: colors.destructive,
            borderColor: colors.destructive,
            opacity: isBusy ? 0.7 : 1,
          },
        ]}
      >
        <ShieldAlert color={colors.destructiveForeground} size={28} />
        <Text style={[styles.sosTitle, { color: colors.destructiveForeground }]}>Send SOS Panic Alert</Text>
        <Text style={[styles.sosCaption, { color: colors.destructiveForeground }]}>
          Captures your live location, auto-grabs front-camera evidence, and writes the incident into the guard alert log.
        </Text>
      </Pressable>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<ClipboardList color={colors.info} size={20} />}
            label="Attendance actions"
            value={String(attendanceCount)}
            caption="Clock events recorded today"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<Users color={colors.warning} size={20} />}
            label="Visitors inside"
            value={String(pendingVisitors)}
            caption="Open visitor entries at the gate"
          />
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<AlertTriangle color={colors.destructive} size={20} />}
            label="SOS events"
            value={String(recentSosCount)}
            caption="Alerts recorded today"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<MapPin color={colors.success} size={20} />}
            label="Queue waiting"
            value={String(offlineQueue.length)}
            caption="Actions waiting for sync"
          />
        </View>
      </View>

      <InfoCard>
        <View style={styles.rowBetween}>
          <View style={styles.rowTitleWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Location + sync status</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              Latest snapshot: {formatTimestamp(lastKnownLocation?.capturedAt ?? null)}
            </Text>
          </View>
          <StatusChip
            label={lastKnownLocation?.withinGeoFence ? 'Within geo-fence' : 'Needs check'}
            tone={geoStatusTone}
          />
        </View>
        <Text style={[styles.syncLine, { color: colors.foreground }]}>
          {lastKnownLocation?.distanceFromAssignedSite == null
            ? 'No live distance captured yet.'
            : `${lastKnownLocation.distanceFromAssignedSite}m from assigned site`}
        </Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Offline testing mode</Text>
            <Text style={[styles.toggleCaption, { color: colors.mutedForeground }]}>
              Force local queueing while you test offline recovery. Real network loss is handled automatically.
            </Text>
          </View>
          <Switch
            onValueChange={(value) => void setOfflineMode(value)}
            thumbColor={colors.primaryForeground}
            trackColor={{ false: colors.border, true: colors.primary }}
            value={isOfflineMode}
          />
        </View>
        <Text style={[styles.syncLine, { color: colors.mutedForeground }]}>
          Connection: {isNetworkOnline ? 'Online' : 'Offline'} | Last successful sync:{' '}
          {formatTimestamp(lastSyncAt)}
        </Text>
        <View style={styles.heroActions}>
          <ActionButton
            label="I am on duty"
            variant="secondary"
            onPress={() => void handlePatrolReset()}
          />
          <ActionButton
            label={isSyncing ? 'Syncing...' : 'Sync queued actions'}
            variant="ghost"
            disabled={isOfflineMode || !isNetworkOnline || isSyncing}
            onPress={() => void handleSyncQueue()}
          />
        </View>
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick actions</Text>
        <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
          Jump into the parts of the guard app you will use most during a live shift.
        </Text>
        <View style={styles.heroActions}>
          <ActionButton
            label="Open checklist"
            variant="secondary"
            onPress={() => navigation.navigate('GuardChecklist')}
          />
          <ActionButton
            label="Log visitor"
            variant="secondary"
            onPress={() => navigation.navigate('GuardVisitors')}
          />
          <ActionButton
            label="My payslips"
            variant="ghost"
            onPress={() => navigation.navigate('GuardStaff', { screen: 'HrmsPayslips' })}
          />
          <ActionButton
            label="My documents"
            variant="ghost"
            onPress={() => navigation.navigate('GuardStaff', { screen: 'HrmsDocuments' })}
          />
          <ActionButton
            label="Emergency contacts"
            variant="ghost"
            onPress={() => navigation.navigate('GuardContacts')}
          />
          <ActionButton label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </InfoCard>

      <NotificationInboxCard
        title="Guard notification centre"
        description="Phase 7 previews the reminder, resident SMS, and manager-escalation routes that start from the guard workspace."
        actions={[
          {
            label: 'Preview checklist reminder',
            route: 'checklist_reminder',
            variant: 'secondary',
          },
          {
            label: 'Preview visitor alert',
            route: 'visitor_at_gate',
            variant: 'ghost',
          },
          {
            label: 'Preview material delivery',
            route: 'material_delivery',
            variant: 'ghost',
          },
        ]}
      />

      <Modal
        animationType="fade"
        onRequestClose={cancelSosCapture}
        transparent
        visible={isSosCaptureOpen}
      >
        <View style={styles.sosCaptureModal}>
          <CameraView
            ref={sosCameraRef}
            active={isSosCaptureOpen}
            facing="front"
            mirror
            onCameraReady={() => void handleSosCameraReady()}
            onMountError={(event) => void handleSosCameraMountError(event.message)}
            style={styles.sosCamera}
          />
          <View style={styles.sosCaptureOverlay}>
            <ShieldAlert color={colors.destructiveForeground} size={28} />
            <Text style={[styles.sosCaptureTitle, { color: colors.destructiveForeground }]}>
              {isCapturingSos ? 'Capturing SOS evidence' : 'Starting SOS camera'}
            </Text>
            <Text style={[styles.sosCaptureCaption, { color: colors.destructiveForeground }]}>
              Keep your face in frame while the app records emergency evidence automatically.
            </Text>
            <ActivityIndicator color={colors.destructiveForeground} />
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  heroTitleWrap: {
    flex: 1,
    gap: Spacing.sm,
  },
  heroTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 28,
  },
  heroCaption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  message: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  heroActions: {
    gap: Spacing.base,
  },
  inactivityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    padding: Spacing.base,
  },
  inactivityWarningText: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  sosCard: {
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  sosTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
  },
  sosCaption: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  sosCaptureModal: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'flex-end',
  },
  sosCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  sosCaptureOverlay: {
    margin: Spacing.xl,
    borderRadius: BorderRadius['2xl'],
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  sosCaptureTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
  },
  sosCaptureCaption: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  metricCell: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  rowTitleWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  sectionCaption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  syncLine: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  toggleCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  toggleTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  toggleCaption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
