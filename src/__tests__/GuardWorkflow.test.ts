import { act } from '@testing-library/react-native';

// MOCK EVERYTHING BEFORE IMPORTS
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: { onAuthStateChange: jest.fn() },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

jest.mock('expo-task-manager', () => ({
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(true),
  defineTask: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
}));

// Mock our internal files that trigger Expo imports
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: jest.fn() },
    rpc: jest.fn(),
  }
}));

jest.mock('../lib/mobileBackend', () => ({
  updatePanicAlertLocation: jest.fn(),
  triggerPanicAlert: jest.fn(),
  isPreviewProfile: jest.fn().mockReturnValue(false),
}));

jest.mock('../lib/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
  getRouteLabel: jest.fn(),
}));

// NOW import the store
import { useGuardStore } from '../store/useGuardStore';

describe('Guard Store Workflow Logic', () => {
  beforeEach(() => {
    act(() => {
      useGuardStore.getState().reset();
    });
  });

  it('initializes with the correct PRD checklist items', () => {
    const state = useGuardStore.getState();
    const itemIds = state.checklistItems.map(item => item.id);
    
    expect(itemIds).toContain('water-pump-status');
    expect(itemIds).toContain('water-tank-level');
    expect(itemIds).toContain('parking-lights');
    expect(itemIds).toContain('gate-shutter-check');
  });

  it('updates water tank level correctly with numeric input', () => {
    act(() => {
      useGuardStore.getState().updateChecklistItem('water-tank-level', {
        numericValue: '85',
        status: 'completed',
        completedAt: new Date().toISOString()
      });
    });

    const item = useGuardStore.getState().checklistItems.find(i => i.id === 'water-tank-level');
    expect(item?.numericValue).toBe('85');
    expect(item?.status).toBe('completed');
  });

  it('triggers an SOS and queues it for offline sync', () => {
    const mockLocation = { latitude: 12.9716, longitude: 77.5946 };
    
    act(() => {
      useGuardStore.getState().triggerPanicAlert('test-user-id', 'Test Guard', mockLocation);
    });

    const state = useGuardStore.getState();
    expect(state.activePanicAlert).not.toBeNull();
    expect(state.offlineQueue.length).toBeGreaterThan(0);
    expect(state.offlineQueue[0].type).toBe('PANIC_ALERT');
  });

  it('calculates the progress correctly as items are completed', () => {
    const totalItems = useGuardStore.getState().checklistItems.length;
    
    act(() => {
      useGuardStore.getState().updateChecklistItem('water-pump-status', {
        responseValue: 'yes',
        status: 'completed'
      });
    });

    const progress = useGuardStore.getState().getChecklistProgress();
    expect(progress).toBeCloseTo((1 / totalItems) * 100);
  });
});
