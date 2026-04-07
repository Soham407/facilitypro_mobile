import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardList, PhoneCall, Shield, Users, UserRound } from 'lucide-react-native';

import { LoadingScreen } from '../components/shared/LoadingScreen';
import { Spacing } from '../constants/spacing';
import { FontFamily, FontSize } from '../constants/typography';
import { useAppTheme } from '../hooks/useAppTheme';
import { fetchGuardEmergencyContacts } from '../lib/mobileBackend';
import { GuardChecklistScreen } from '../screens/guard/GuardChecklistScreen';
import { GuardContactsScreen } from '../screens/guard/GuardContactsScreen';
import { GuardHomeScreen } from '../screens/guard/GuardHomeScreen';
import { GuardVisitorsScreen } from '../screens/guard/GuardVisitorsScreen';
import { HrmsSubNavigator } from './HrmsSubNavigator';
import { useAppStore } from '../store/useAppStore';
import { useGuardStore } from '../store/useGuardStore';
import { useHrmsStore } from '../store/useHrmsStore';
import type { GuardTabParamList } from './types';

const Tab = createBottomTabNavigator<GuardTabParamList>();

export function GuardNavigator() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const profileUserId = profile?.userId ?? null;
  const bootstrapGuard = useGuardStore((state) => state.bootstrap);
  const bootstrapHrms = useHrmsStore((state) => state.bootstrap);
  const hasHydrated = useGuardStore((state) => state.hasHydrated);
  const hydrateEmergencyContacts = useGuardStore((state) => state.hydrateEmergencyContacts);

  useEffect(() => {
    void bootstrapGuard(profile);
    void bootstrapHrms(profile);
  }, [bootstrapGuard, bootstrapHrms, profile]);

  useEffect(() => {
    if (!hasHydrated || !profileUserId || profileUserId.startsWith('dev-preview-')) {
      return;
    }

    fetchGuardEmergencyContacts()
      .then((contacts) => {
        if (contacts.length > 0) {
          return hydrateEmergencyContacts(contacts);
        }

        return undefined;
      })
      .catch(() => {});
  }, [hasHydrated, hydrateEmergencyContacts, profileUserId]);

  if (!hasHydrated) {
    return <LoadingScreen />;
  }

  return (
    <Tab.Navigator
      initialRouteName="GuardHome"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 78,
          paddingBottom: Spacing.base,
          paddingTop: Spacing.sm,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamily.sansSemiBold,
          fontSize: FontSize.xs,
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'GuardChecklist') {
            return <ClipboardList color={color} size={size} />;
          }

          if (route.name === 'GuardVisitors') {
            return <Users color={color} size={size} />;
          }

          if (route.name === 'GuardStaff') {
            return <UserRound color={color} size={size} />;
          }

          return <Shield color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen component={GuardHomeScreen} name="GuardHome" options={{ title: 'Home' }} />
      <Tab.Screen
        component={GuardChecklistScreen}
        name="GuardChecklist"
        options={{ title: 'Checklist' }}
      />
      <Tab.Screen
        component={GuardVisitorsScreen}
        name="GuardVisitors"
        options={{ title: 'Visitors' }}
      />
      <Tab.Screen
        component={HrmsSubNavigator}
        name="GuardStaff"
        options={{ title: 'Staff' }}
      />
    </Tab.Navigator>
  );
}
