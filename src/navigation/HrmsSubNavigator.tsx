import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HrmsHomeScreen } from '../screens/hrms/HrmsHomeScreen';
import { HrmsAttendanceScreen } from '../screens/hrms/HrmsAttendanceScreen';
import { HrmsLeaveScreen } from '../screens/hrms/HrmsLeaveScreen';
import { HrmsPayslipsScreen } from '../screens/hrms/HrmsPayslipsScreen';
import { HrmsDocumentsScreen } from '../screens/hrms/HrmsDocumentsScreen';
import type { HrmsSubStackParamList } from './types';

const Stack = createNativeStackNavigator<HrmsSubStackParamList>();

export function HrmsSubNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HrmsDashboard" component={HrmsHomeScreen as any} />
      <Stack.Screen name="HrmsAttendance" component={HrmsAttendanceScreen as any} />
      <Stack.Screen name="HrmsLeave" component={HrmsLeaveScreen as any} />
      <Stack.Screen name="HrmsPayslips" component={HrmsPayslipsScreen as any} />
      <Stack.Screen name="HrmsDocuments" component={HrmsDocumentsScreen as any} />
    </Stack.Navigator>
  );
}
