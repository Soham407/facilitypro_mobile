import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, ClipboardList, House, ShieldAlert, UserRound } from 'lucide-react-native';

import { LoadingScreen } from '../components/shared/LoadingScreen';
import { Spacing } from '../constants/spacing';
import { FontFamily, FontSize } from '../constants/typography';
import { useAppTheme } from '../hooks/useAppTheme';
import { OversightAlertsScreen } from '../screens/oversight/OversightAlertsScreen';
import { OversightHomeScreen } from '../screens/oversight/OversightHomeScreen';
import { OversightOperationsScreen } from '../screens/oversight/OversightOperationsScreen';
import { OversightTicketsScreen } from '../screens/oversight/OversightTicketsScreen';
import { HrmsSubNavigator } from './HrmsSubNavigator';
import { useAppStore } from '../store/useAppStore';
import { useOversightStore } from '../store/useOversightStore';
import { useHrmsStore } from '../store/useHrmsStore';
import type { OversightTabParamList } from './types';

const Tab = createBottomTabNavigator<OversightTabParamList>();

export function OversightNavigator() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const bootstrapOversight = useOversightStore((state) => state.bootstrap);
  const bootstrapHrms = useHrmsStore((state) => state.bootstrap);
  const hasHydrated = useOversightStore((state) => state.hasHydrated);

  useEffect(() => {
    void bootstrapOversight(profile);
    void bootstrapHrms(profile);
  }, [bootstrapOversight, bootstrapHrms, profile]);

  if (!hasHydrated) {
    return <LoadingScreen />;
  }

  return (
    <Tab.Navigator
      initialRouteName="OversightHome"
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
          if (route.name === 'OversightAlerts') {
            return <Bell color={color} size={size} />;
          }

          if (route.name === 'OversightOperations') {
            return <ClipboardList color={color} size={size} />;
          }

          if (route.name === 'OversightTickets') {
            return <ShieldAlert color={color} size={size} />;
          }

          if (route.name === 'OversightStaff') {
            return <UserRound color={color} size={size} />;
          }

          return <House color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen
        component={OversightHomeScreen}
        name="OversightHome"
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        component={OversightAlertsScreen}
        name="OversightAlerts"
        options={{ title: 'Alerts' }}
      />
      <Tab.Screen
        component={OversightOperationsScreen}
        name="OversightOperations"
        options={{ title: 'Ops' }}
      />
      <Tab.Screen
        component={OversightTicketsScreen}
        name="OversightTickets"
        options={{ title: 'Tickets' }}
      />
      <Tab.Screen
        component={HrmsSubNavigator}
        name="OversightStaff"
        options={{ title: 'Staff' }}
      />
    </Tab.Navigator>
  );
}
