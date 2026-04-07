import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Camera, ClipboardList, House, Package, UserRound } from 'lucide-react-native';

import { LoadingScreen } from '../components/shared/LoadingScreen';
import { Spacing } from '../constants/spacing';
import { FontFamily, FontSize } from '../constants/typography';
import { useAppTheme } from '../hooks/useAppTheme';
import { ServiceHomeScreen } from '../screens/service/ServiceHomeScreen';
import { ServiceMaterialsScreen } from '../screens/service/ServiceMaterialsScreen';
import { ServiceProofScreen } from '../screens/service/ServiceProofScreen';
import { ServiceTasksScreen } from '../screens/service/ServiceTasksScreen';
import { HrmsSubNavigator } from './HrmsSubNavigator';
import { useAppStore } from '../store/useAppStore';
import { useServiceStore } from '../store/useServiceStore';
import { useHrmsStore } from '../store/useHrmsStore';
import type { ServiceTabParamList } from './types';

const Tab = createBottomTabNavigator<ServiceTabParamList>();

export function ServiceNavigator() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const bootstrapService = useServiceStore((state) => state.bootstrap);
  const bootstrapHrms = useHrmsStore((state) => state.bootstrap);
  const hasHydrated = useServiceStore((state) => state.hasHydrated);

  useEffect(() => {
    void bootstrapService(profile);
    void bootstrapHrms(profile);
  }, [bootstrapService, bootstrapHrms, profile]);

  if (!hasHydrated) {
    return <LoadingScreen />;
  }

  return (
    <Tab.Navigator
      initialRouteName="ServiceHome"
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
          if (route.name === 'ServiceTasks') {
            return <ClipboardList color={color} size={size} />;
          }

          if (route.name === 'ServiceMaterials') {
            return <Package color={color} size={size} />;
          }

          if (route.name === 'ServiceStaff') {
            return <UserRound color={color} size={size} />;
          }

          return <House color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen component={ServiceHomeScreen} name="ServiceHome" options={{ title: 'Home' }} />
      <Tab.Screen component={ServiceTasksScreen} name="ServiceTasks" options={{ title: 'Tasks' }} />
      <Tab.Screen
        component={ServiceMaterialsScreen}
        name="ServiceMaterials"
        options={{ title: 'Materials' }}
      />
      <Tab.Screen component={HrmsSubNavigator} name="ServiceStaff" options={{ title: 'Staff' }} />
    </Tab.Navigator>
  );
}
