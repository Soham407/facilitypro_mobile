import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Building2, MapPin, Shield, Smartphone } from 'lucide-react-native';

import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { RoleBadge } from '../../components/shared/RoleBadge';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { RoleStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import type { AppRole } from '../../types/app';

type RoleLandingScreenProps = NativeStackScreenProps<RoleStackParamList, 'RoleLanding'>;

const ROLE_COPY: Record<AppRole, { title: string; subtitle: string }> = {
  admin: {
    title: 'Admin mobile workspace',
    subtitle: 'Platform-wide oversight and quick approvals will land here next.',
  },
  company_md: {
    title: 'Managing director workspace',
    subtitle: 'High-level operational visibility is ready for later phases.',
  },
  company_hod: {
    title: 'Department head workspace',
    subtitle: 'You are routed into the HOD-specific mobile shell.',
  },
  account: {
    title: 'Accounts workspace',
    subtitle: 'Finance-focused mobile flows will layer onto this shell.',
  },
  delivery_boy: {
    title: 'Delivery workflow workspace',
    subtitle: 'Pickup, transit, and proof-of-delivery flows are next.',
  },
  buyer: {
    title: 'Buyer workspace',
    subtitle: 'Order creation and tracking will build on this role entry.',
  },
  supplier: {
    title: 'Supplier workspace',
    subtitle: 'Indent, PO, and billing workflows are wired to this navigator.',
  },
  vendor: {
    title: 'Vendor workspace',
    subtitle: 'Vendor-facing procurement workflows will enter here.',
  },
  security_guard: {
    title: 'Guard operations workspace',
    subtitle: 'SOS, attendance, checklist, and visitor tools plug into this shell next.',
  },
  security_supervisor: {
    title: 'Security supervisor workspace',
    subtitle: 'Live monitoring and incident oversight will build here.',
  },
  society_manager: {
    title: 'Society manager workspace',
    subtitle: 'Operational approvals and monitoring are routed correctly.',
  },
  ac_technician: {
    title: 'AC technician workspace',
    subtitle: 'Before/after evidence and work logging will attach here.',
  },
  pest_control_technician: {
    title: 'Pest control workspace',
    subtitle: 'PPE and chemical-request flows will build onto this shell.',
  },
  service_boy: {
    title: 'Service staff workspace',
    subtitle: 'Assigned-task workflows will sit on this entry point.',
  },
  storekeeper: {
    title: 'Storekeeper workspace',
    subtitle: 'Inventory actions will build onto this shell later.',
  },
  site_supervisor: {
    title: 'Site supervisor workspace',
    subtitle: 'Site-level operations are routed into the right stack.',
  },
  super_admin: {
    title: 'Super admin workspace',
    subtitle: 'Platform controls are ready for later mobile expansion.',
  },
  employee: {
    title: 'Employee workspace',
    subtitle: 'General HRMS mobile features will attach to this role shell.',
  },
};

export function RoleLandingScreen({ route }: RoleLandingScreenProps) {
  const { colors } = useAppTheme();
  const signOut = useAppStore((state) => state.signOut);
  const onboarding = useAppStore((state) => state.onboarding);
  const profile = useAppStore((state) => state.profile);
  const currentRole = route.params?.role ?? profile?.role ?? 'employee';
  const copy = ROLE_COPY[currentRole] ?? ROLE_COPY.employee;

  return (
    <ScreenShell
      eyebrow="Phase 1 ready"
      title={copy.title}
      description={copy.subtitle}
      footer={<ActionButton label="Sign out" variant="ghost" onPress={() => void signOut()} />}
    >
      <InfoCard>
        <RoleBadge label={currentRole.replace(/_/g, ' ')} />
        <Text style={[styles.title, { color: colors.foreground }]}>{profile?.fullName ?? 'FacilityPro user'}</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          The foundation is active: OTP auth, onboarding, role routing, and session protection.
        </Text>
      </InfoCard>

      <InfoCard>
        <View style={styles.row}>
          <Shield color={colors.primary} size={20} />
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>Biometric prompt completed</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
            {onboarding.biometricPrompted ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.row}>
          <Smartphone color={colors.info} size={20} />
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>Employee code</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
            {profile?.employeeCode ?? 'Pending'}
          </Text>
        </View>
        <View style={styles.row}>
          <Building2 color={colors.warning} size={20} />
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>Assigned role</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
            {currentRole.replace(/_/g, ' ')}
          </Text>
        </View>
        <View style={styles.row}>
          <MapPin color={colors.success} size={20} />
          <Text style={[styles.rowLabel, { color: colors.foreground }]}>Geo calibration</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
            {onboarding.geoCalibration?.locationName ?? profile?.assignedLocation?.locationName ?? 'Pending'}
          </Text>
        </View>
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.base,
  },
  rowValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
  },
});
