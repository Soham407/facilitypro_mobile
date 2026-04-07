import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BuyerNavigator } from './BuyerNavigator';
import { GuardNavigator } from './GuardNavigator';
import { HRMSNavigator } from './HRMSNavigator';
import { OversightNavigator } from './OversightNavigator';
import { ServiceNavigator } from './ServiceNavigator';
import { SupplierNavigator } from './SupplierNavigator';
import { RoleLandingScreen } from '../screens/app/RoleLandingScreen';
import type { AppRole } from '../types/app';
import type { RoleStackParamList } from './types';

const Stack = createNativeStackNavigator<RoleStackParamList>();

interface RoleNavigatorProps {
  role: AppRole | null;
}

export function RoleNavigator({ role }: RoleNavigatorProps) {
  if (role === 'security_guard') {
    return <GuardNavigator />;
  }

  if (role === 'employee') {
    return <HRMSNavigator />;
  }

  if (role === 'security_supervisor' || role === 'society_manager') {
    return <OversightNavigator />;
  }

  if (role === 'buyer') {
    return <BuyerNavigator />;
  }

  if (
    role === 'ac_technician' ||
    role === 'pest_control_technician' ||
    role === 'delivery_boy' ||
    role === 'service_boy'
  ) {
    return <ServiceNavigator />;
  }

  if (role === 'supplier' || role === 'vendor') {
    return <SupplierNavigator />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        component={RoleLandingScreen}
        initialParams={{ role }}
        name="RoleLanding"
      />
    </Stack.Navigator>
  );
}
