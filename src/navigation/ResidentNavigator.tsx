import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, DoorOpen, House } from 'lucide-react-native';

import { Spacing } from '../constants/spacing';
import { FontFamily, FontSize } from '../constants/typography';
import { useAppTheme } from '../hooks/useAppTheme';
import { ResidentApprovalsScreen } from '../screens/resident/ResidentApprovalsScreen';
import { ResidentHomeScreen } from '../screens/resident/ResidentHomeScreen';
import { ResidentNotificationsScreen } from '../screens/resident/ResidentNotificationsScreen';
import type { ResidentTabParamList } from './types';

const Tab = createBottomTabNavigator<ResidentTabParamList>();

export function ResidentNavigator() {
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      initialRouteName="ResidentHome"
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
          if (route.name === 'ResidentApprovals') {
            return <DoorOpen color={color} size={size} />;
          }

          if (route.name === 'ResidentNotifications') {
            return <Bell color={color} size={size} />;
          }

          return <House color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen component={ResidentHomeScreen} name="ResidentHome" options={{ title: 'Home' }} />
      <Tab.Screen
        component={ResidentApprovalsScreen}
        name="ResidentApprovals"
        options={{ title: 'Approvals' }}
      />
      <Tab.Screen
        component={ResidentNotificationsScreen}
        name="ResidentNotifications"
        options={{ title: 'Alerts' }}
      />
    </Tab.Navigator>
  );
}
