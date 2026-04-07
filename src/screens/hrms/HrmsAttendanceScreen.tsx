import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Clock3, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../store/useAppStore';
import { useHrmsStore } from '../../store/useHrmsStore';
import type { HRMSTabParamList } from '../../navigation/types';
import { capturePhoto } from '../../lib/media';

type HrmsAttendanceScreenProps = BottomTabScreenProps<
  HRMSTabParamList,
  'HRMSAttendance'
>;

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTimeLabel(value: string | null) {
  if (!value) {
    return 'Pending';
  }

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HrmsAttendanceScreen(_props: HrmsAttendanceScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const onboarding = useAppStore((state) => state.onboarding);
  
  const { attendance, isLoading, clockIn, clockOut } = useHrmsStore();

  const handleAttendance = async (action: 'check-in' | 'check-out') => {
    try {
      const asset = await capturePhoto({
        cameraType: 'front',
        aspect: [1, 1],
      });

      if (!asset) {
        throw new Error('Selfie capture was cancelled.');
      }

      if (action === 'check-in') {
        await clockIn(profile, onboarding, asset.uri);
      } else {
        await clockOut(profile, onboarding, asset.uri);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Attendance could not be saved.';
      Alert.alert('Attendance update', message);
    }
  };

  const latestRecord = attendance?.[0] ?? null;

  return (
    <ScreenShell
      eyebrow="HRMS attendance"
      title="Selfie + geo-fence attendance"
      description="Every attendance action validates your live location first, then stores a selfie-backed shift record for payroll and supervisor review."
      footer={
        <View style={styles.footer}>
          <ActionButton
            label="Check in with selfie"
            loading={isLoading}
            onPress={() => handleAttendance('check-in')}
          />
          <ActionButton
            label="Check out with selfie"
            variant="secondary"
            loading={isLoading}
            onPress={() => handleAttendance('check-out')}
          />
        </View>
      }
    >
      {isLoading ? (
        <InfoCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Updating attendance...
            </Text>
          </View>
        </InfoCard>
      ) : null}


      <InfoCard>
        <View style={styles.headerRow}>
          <ShieldCheck color={colors.success} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Today&apos;s gate check</Text>
        </View>
        <Text style={[styles.statusValue, { color: colors.foreground }]}>
          {latestRecord?.checkOutTime
            ? 'Shift closed'
            : latestRecord?.checkInTime
              ? 'Checked in'
              : 'Awaiting first selfie'}
        </Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          {latestRecord?.geoFenceStatus
            ? `${latestRecord.geoFenceStatus.locationName} | ${latestRecord.geoFenceStatus.distanceMeters}m from the allowed point`
            : onboarding.geoCalibration
              ? `${onboarding.geoCalibration.locationName} is your active geo-fence anchor.`
              : 'Complete geo-fence calibration first if attendance validation blocks you.'}
        </Text>
        {latestRecord?.lastSelfieUri ? (
          <Image source={{ uri: latestRecord.lastSelfieUri }} style={styles.previewImage} />
        ) : null}
      </InfoCard>

      <InfoCard>
        <View style={styles.headerRow}>
          <TriangleAlert color={colors.warning} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Auto punch-out policy</Text>
        </View>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          If the device stays outside the registered geo-fence for more than 15 consecutive minutes,
          Phase 4 flags the shift for supervisor review and queues the record for follow-up.
        </Text>
      </InfoCard>

      <InfoCard>
        <View style={styles.headerRow}>
          <Clock3 color={colors.info} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Recent attendance</Text>
        </View>
        {attendance.length ? (
          attendance.map((item) => (
            <View key={item.id} style={[styles.logRow, { borderColor: colors.border }]}>
              <View style={styles.logCopy}>
                <Text style={[styles.logDate, { color: colors.foreground }]}>
                  {formatDateLabel(item.logDate)}
                </Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                  In {formatTimeLabel(item.checkInTime)} | Out {formatTimeLabel(item.checkOutTime)}
                </Text>
                <Text style={[styles.syncTag, { color: colors.info }]}>
                  {item.syncStatus === 'synced'
                    ? 'Synced'
                    : item.syncStatus === 'pending'
                      ? 'Queued locally'
                      : 'Preview only'}
                </Text>
              </View>
              <Text style={[styles.hoursText, { color: colors.foreground }]}>
                {item.totalHours ? `${item.totalHours}h` : '--'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            No attendance logs yet. Your first check-in will appear here.
          </Text>
        )}
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: Spacing.base,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.base,
  },
  loadingText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.base,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  statusValue: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  previewImage: {
    borderRadius: 16,
    height: 188,
    marginTop: Spacing.sm,
    width: '100%',
  },
  logRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: Spacing.base,
    paddingTop: Spacing.base,
  },
  logCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  logDate: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  syncTag: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  hoursText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.base,
  },
});
