import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CalendarDays, FileText, House, ShieldCheck, WalletCards } from 'lucide-react-native';

import { useAppTheme } from '../hooks/useAppTheme';
import { HrmsAttendanceScreen } from '../screens/hrms/HrmsAttendanceScreen';
import { HrmsDocumentsScreen } from '../screens/hrms/HrmsDocumentsScreen';
import { HrmsHomeScreen } from '../screens/hrms/HrmsHomeScreen';
import { HrmsLeaveScreen } from '../screens/hrms/HrmsLeaveScreen';
import { HrmsPayslipsScreen } from '../screens/hrms/HrmsPayslipsScreen';
import { useAppStore } from '../store/useAppStore';
import { useHrmsStore } from '../store/useHrmsStore';
import type { HRMSTabParamList } from './types';

const Tab = createBottomTabNavigator<HRMSTabParamList>();

export function HRMSNavigator() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const bootstrap = useHrmsStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap(profile);
  }, [bootstrap, profile]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        component={HrmsHomeScreen}
        name="HRMSHome"
        options={{
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        component={HrmsAttendanceScreen}
        name="HRMSAttendance"
        options={{
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
          tabBarLabel: 'Attendance',
        }}
      />
      <Tab.Screen
        component={HrmsLeaveScreen}
        name="HRMSLeave"
        options={{
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
          tabBarLabel: 'Leave',
        }}
      />
      <Tab.Screen
        component={HrmsPayslipsScreen}
        name="HRMSPayslips"
        options={{
          tabBarIcon: ({ color, size }) => <WalletCards color={color} size={size} />,
          tabBarLabel: 'Payslips',
        }}
      />
      <Tab.Screen
        component={HrmsDocumentsScreen}
        name="HRMSDocuments"
        options={{
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
          tabBarLabel: 'Documents',
        }}
      />
    </Tab.Navigator>
  );
}
