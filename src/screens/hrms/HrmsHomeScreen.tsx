import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CalendarClock, FileStack, IndianRupee, MapPinned } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { InfoCard } from '../../components/shared/InfoCard';
import { NotificationInboxCard } from '../../components/shared/NotificationInboxCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { HRMSTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useHrmsStore } from '../../store/useHrmsStore';

type HrmsHomeScreenProps = BottomTabScreenProps<HRMSTabParamList, 'HRMSHome'>;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatDateLabel(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function HrmsHomeScreen({ navigation }: HrmsHomeScreenProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const { 
    attendance, 
    leaveTypes, 
    leaveApplications, 
    payslips, 
    documents, 
    isLoading: storeLoading 
  } = useHrmsStore();

  const todayAttendance = attendance[0] ?? null;
  const pendingLeaves =
    leaveApplications.filter((item) => item.status === 'pending').length ?? 0;
  const latestPayslip = payslips[0] ?? null;
  const verifiedDocuments =
    documents.filter((item) => item.isVerified).length ?? 0;
  const totalLeaveBalance =
    leaveTypes.reduce((sum, item) => sum + item.remainingDays, 0) ?? 0;

  return (
    <ScreenShell
      eyebrow={profile?.preferences.previewMode ? 'Phase 4 preview' : 'Phase 4'}
      title="HRMS command deck"
      description="Attendance, leave, payroll, and document access are grouped here so payroll-administered staff can work from one mobile workspace."
    >
      {storeLoading ? (
        <InfoCard>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Loading your HRMS snapshot...
            </Text>
          </View>
        </InfoCard>
      ) : null}

      {profile?.preferences.previewMode ? (
        <InfoCard>
          <Text style={[styles.previewTitle, { color: colors.foreground }]}>Preview mode is active</Text>
          <Text style={[styles.previewCopy, { color: colors.mutedForeground }]}>
            Local demo data is filling gaps until you sign in as a real payroll user or the
            remaining HRMS policies are opened up server-side.
          </Text>
        </InfoCard>
      ) : null}

      <InfoCard>
        <View style={styles.metricHeader}>
          <MapPinned color={colors.primary} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Today&apos;s attendance</Text>
        </View>
        <Text style={[styles.metricValue, { color: colors.foreground }]}>
          {todayAttendance?.checkOutTime
            ? 'Shift closed'
            : todayAttendance?.checkInTime
              ? 'Checked in'
              : 'Awaiting check-in'}
        </Text>
        <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
          {todayAttendance?.geoFenceStatus
            ? `${todayAttendance.geoFenceStatus.locationName} | ${todayAttendance.geoFenceStatus.distanceMeters}m from the registered point`
            : 'Geo-fence validation happens at check-in and check-out.'}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('HRMSAttendance')}
          style={[styles.linkButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.linkLabel, { color: colors.foreground }]}>Open attendance desk</Text>
        </Pressable>
      </InfoCard>

      <View style={styles.grid}>
        <InfoCard>
          <View style={styles.metricHeader}>
            <CalendarClock color={colors.warning} size={20} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Leave balance</Text>
          </View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{totalLeaveBalance} days</Text>
          <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
            {pendingLeaves} request{pendingLeaves === 1 ? '' : 's'} pending supervisor action.
          </Text>
        </InfoCard>

        <InfoCard>
          <View style={styles.metricHeader}>
            <IndianRupee color={colors.success} size={20} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Latest payslip</Text>
          </View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {latestPayslip ? currencyFormatter.format(latestPayslip.netSalary) : 'Pending'}
          </Text>
          <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
            {latestPayslip
              ? `For ${formatDateLabel(latestPayslip.payPeriodTo)}`
              : 'Your last 12 payroll cycles will appear here.'}
          </Text>
        </InfoCard>
      </View>

      <InfoCard>
        <View style={styles.metricHeader}>
          <FileStack color={colors.info} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Document vault</Text>
        </View>
        <Text style={[styles.metricValue, { color: colors.foreground }]}>
          {verifiedDocuments}/{documents.length} verified
        </Text>
        <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
          Aadhar, PAN, Voter ID, and role-specific compliance documents live in one place.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('HRMSDocuments')}
          style={[styles.linkButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.linkLabel, { color: colors.foreground }]}>Open document vault</Text>
        </Pressable>
      </InfoCard>

      <InfoCard>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Next actions</Text>
        <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
          1. Confirm today&apos;s attendance with a selfie.
        </Text>
        <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
          2. Submit upcoming leave before payroll locks for the month.
        </Text>
        <Text style={[styles.metricCopy, { color: colors.mutedForeground }]}>
          3. Replace any unverified compliance document from camera or gallery.
        </Text>
      </InfoCard>

      <NotificationInboxCard
        title="HRMS notifications"
        description="Phase 7 previews employee-facing leave and payroll alerts with the same inbox history used for mobile verification."
        actions={[
          {
            label: 'Preview leave decision',
            route: 'leave_decision',
            variant: 'secondary',
          },
          {
            label: 'Preview payslip ready',
            route: 'payslip_ready',
            variant: 'ghost',
          },
          {
            label: 'Preview geo-fence breach',
            route: 'inactivity_alert',
            variant: 'ghost',
          },
        ]}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.base,
  },
  loadingText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.base,
  },
  previewTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  previewCopy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricValue: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 30,
  },
  metricCopy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  linkButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: Spacing.base,
  },
  linkLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  grid: {
    gap: Spacing.lg,
  },
});
