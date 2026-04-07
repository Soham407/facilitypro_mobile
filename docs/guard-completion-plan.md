# Security Guard App — Completion Plan

## Context

Core screens (home, checklist, visitors, contacts) are built and wired to Supabase. Four PRD requirements remain unimplemented:

1. **Inactivity patrol watchdog** — PRD §3.4: 30-min no-movement → inactivity SOS, 25-min vibration warning, "I am on duty" reset. Needs Android background location task.
2. **Post-SOS GPS streaming** — PRD §3.2: continuous location updates until manager resolves the alert. `streamingActive` flag exists on `GuardSosEvent` but no interval runs.
3. **Checklist 9AM reminder** — PRD §3.3: scheduled local notification if checklist not opened by 9 AM. Route defined in `notifications.ts` but never scheduled.
4. **Emergency contacts from backend** — PRD §3.6: manager-configured contacts. Currently hardcoded defaults with no RPC fetch.

`app.json` already has `ACCESS_BACKGROUND_LOCATION`. `expo-task-manager` is already installed.

---

## Step 1 — New file: `src/lib/patrolTask.ts`

Android-only background location task for inactivity monitoring.

**Must be imported in `index.ts` BEFORE `registerRootComponent`** so the task handler is registered at bundle load time.

**AsyncStorage keys:**
- `@guard_patrol_meta` — `PatrolMeta` JSON
- `@guard_pending_inactivity_sos` — written by background task, consumed by foreground

**`PatrolMeta` interface:**
```ts
interface PatrolMeta {
  dutyStatus: 'on_duty' | 'off_duty';
  lastMovementLat: number;
  lastMovementLng: number;
  lastMovementAt: string; // ISO string
  warningSentAt: string | null;
}
```

**Exports:**

`PATROL_LOCATION_TASK = 'guard-patrol-location-watch'`

`definePatrolTask()` — registers `TaskManager.defineTask(PATROL_LOCATION_TASK, handler)`.

Handler logic (called by expo-location every 60s when registered):
1. Read `PatrolMeta` from AsyncStorage. If `dutyStatus !== 'on_duty'` → return early.
2. Get new location from `data.locations[0]`.
3. Calculate `distanceMoved` from `lastMovementLat/Lng` to new coords using Haversine (`calculateDistanceMeters` from `./location`).
4. If moved > 10m → update `lastMovementLat/Lng`, reset `lastMovementAt = now`, clear `warningSentAt`, save, return.
5. Calculate `elapsed = Date.now() - new Date(lastMovementAt).getTime()`.
6. If elapsed ≥ 25 min AND no `warningSentAt` → schedule urgent local notification: *"Inactivity warning — tap the app to confirm you are active. SOS will be sent in 5 minutes."*, set `warningSentAt = now`.
7. If elapsed ≥ 30 min → schedule local notification: *"Inactivity SOS triggered automatically."*, write `@guard_pending_inactivity_sos` = `JSON.stringify({ latitude, longitude })`, reset `lastMovementAt = now` (re-arms for next 30-min window).

`startPatrolTracking(lat: number, lng: number): Promise<void>`
- Android-only guard (`Platform.OS !== 'android'` → return).
- Saves initial `PatrolMeta` with `dutyStatus: 'on_duty'`, provided lat/lng as `lastMovementLat/Lng`, `lastMovementAt = now`, `warningSentAt = null`.
- Calls `Location.startLocationUpdatesAsync(PATROL_LOCATION_TASK, { timeInterval: 60_000, distanceInterval: 0, accuracy: Location.Accuracy.Balanced })`.

`stopPatrolTracking(): Promise<void>`
- Android-only.
- Calls `Location.stopLocationUpdatesAsync(PATROL_LOCATION_TASK)` (wrapped in try/catch).
- Removes `@guard_patrol_meta` from AsyncStorage.

`consumePendingInactivitySos(): Promise<{ latitude: number; longitude: number } | null>`
- Reads `@guard_pending_inactivity_sos`.
- If found: removes key, parses and returns `{ latitude, longitude }`.
- Returns null if not found.

---

## Step 2 — Modify `index.ts`

Add before `registerRootComponent(App)`:

```ts
import { definePatrolTask } from './src/lib/patrolTask';
definePatrolTask();
```

---

## Step 3 — Modify `src/types/guard.ts`

Add `lastMovementLocation: GuardLocationSnapshot | null` to `GuardPersistedState`.

---

## Step 4 — Modify `src/store/useGuardStore.ts`

**Add to default state:**
```ts
lastMovementLocation: null,
```

**Add to `buildPersistedState`:**
```ts
lastMovementLocation: state.lastMovementLocation,
```

**Add to `normalizeHydratedState` spread** (so it survives hydration).

**New action: `updatePatrolLocation(location: GuardLocationSnapshot)`**
- Get `lastMovementLocation` from current state.
- If `lastMovementLocation` exists: call `calculateDistanceMeters(...)`.
  - If distance > 10m: set `lastMovementLocation = location`, call `resetPatrolClock()`.
  - Else: just call `rememberLocation(location)`.
- If no `lastMovementLocation`: set it and call `resetPatrolClock()`.
- Persist.

**New action: `stopSosStreaming(eventId: string)`**
- Map `sosEvents`: set `streamingActive = false` on matching event.
- Persist.

**New action: `hydrateEmergencyContacts(contacts: GuardEmergencyContact[])`**
- Set `emergencyContacts = contacts`, persist.

**Update `clockIn`:**
After the `set(...)` call, add:
```ts
if (options.location) {
  void startPatrolTracking(options.location.latitude, options.location.longitude).catch(() => {});
}
void scheduleChecklistReminder().catch(() => {});
```

**Update `clockOut`:**
After the `set(...)` call, add:
```ts
void stopPatrolTracking().catch(() => {});
```

**Update `submitChecklist`:**
After `await persistGuardStore(get)`, add:
```ts
void cancelChecklistReminder().catch(() => {});
```

**Add imports at top of file:**
```ts
import { startPatrolTracking, stopPatrolTracking } from '../lib/patrolTask';
import { scheduleChecklistReminder, cancelChecklistReminder } from '../lib/notifications';
```

---

## Step 5 — Modify `src/lib/notifications.ts`

Append to end of file:

```ts
const CHECKLIST_REMINDER_ID = 'guard-checklist-9am';

export async function scheduleChecklistReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(CHECKLIST_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: CHECKLIST_REMINDER_ID,
    content: {
      title: 'Checklist Reminder',
      body: 'Your daily guard checklist has not been started yet.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  });
}

export async function cancelChecklistReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(CHECKLIST_REMINDER_ID).catch(() => {});
}
```

---

## Step 6 — Modify `src/lib/mobileBackend.ts`

Add three new exported functions at the end of the file:

**`streamPanicAlertLocation`**
```ts
export async function streamPanicAlertLocation(
  alertId: string,
  location: GuardLocationSnapshot,
): Promise<void> {
  try {
    await supabase.rpc('update_panic_alert_location', {
      p_alert_id: alertId,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_captured_at: location.capturedAt,
    });
  } catch {
    // best-effort streaming, silent fail
  }
}
```

**`fetchPanicAlertStatus`**
```ts
export async function fetchPanicAlertStatus(
  alertId: string,
): Promise<'active' | 'acknowledged' | 'resolved' | null> {
  try {
    const { data, error } = await supabase.rpc('get_panic_alert_status', {
      p_alert_id: alertId,
    });
    if (error || !data) return null;
    return normalizeAlertStatus(data as string) as 'active' | 'acknowledged' | 'resolved';
  } catch {
    return null;
  }
}
```

**`fetchGuardEmergencyContacts`**
```ts
export async function fetchGuardEmergencyContacts(): Promise<GuardEmergencyContact[]> {
  try {
    const { data, error } = await supabase.rpc('get_guard_emergency_contacts');
    if (error || !data) return [];
    return ((data ?? []) as Array<Record<string, string | boolean | null>>).map((row) => ({
      id: String(row.id ?? row.contact_id ?? Math.random()),
      label: row.label ? String(row.label) : 'Contact',
      role: row.role ? String(row.role) : '',
      phone: row.phone ? String(row.phone) : '',
      description: row.description ? String(row.description) : '',
      primary: Boolean(row.is_primary ?? row.primary),
    }));
  } catch {
    return [];
  }
}
```

Add `GuardEmergencyContact` to the import from `'../types/guard'` at the top.

> **Backend note:** Three Supabase RPCs are required:
> - `update_panic_alert_location(p_alert_id, p_latitude, p_longitude, p_captured_at)` — updates lat/lng on panic_alerts row
> - `get_panic_alert_status(p_alert_id)` — returns the alert's current status string
> - `get_guard_emergency_contacts()` — returns rows from emergency_contacts table for the guard's assigned location/company

---

## Step 7 — Modify `src/screens/guard/GuardHomeScreen.tsx`

### New imports
```ts
import { AppState, Vibration } from 'react-native';
import { consumePendingInactivitySos } from '../../lib/patrolTask';
import { streamPanicAlertLocation, fetchPanicAlertStatus } from '../../lib/mobileBackend';
```

### New local state and refs
```ts
const [showInactivityWarning, setShowInactivityWarning] = useState(false);
const warningShownRef = useRef(false);
const checkCounterRef = useRef(0);
```

### New store selectors
```ts
const updatePatrolLocation = useGuardStore((state) => state.updatePatrolLocation);
const stopSosStreaming = useGuardStore((state) => state.stopSosStreaming);
```

### Effect A — AppState foreground listener (runs once on mount)
```ts
useEffect(() => {
  const sub = AppState.addEventListener('change', async (nextState) => {
    if (nextState !== 'active') return;
    const pending = await consumePendingInactivitySos();
    if (!pending) return;
    try {
      const snapshot: GuardLocationSnapshot = {
        latitude: pending.latitude,
        longitude: pending.longitude,
        capturedAt: new Date().toISOString(),
        distanceFromAssignedSite: null,
        withinGeoFence: true,
      };
      await triggerSos({
        alertType: 'inactivity',
        note: 'Auto-inactivity: no patrol movement detected for 30 minutes.',
        location: snapshot,
        photoUri: null,
      });
    } catch { /* silent */ }
  });
  return () => sub.remove();
}, [triggerSos]);
```

### Effect B — Foreground inactivity watchdog (depends on `dutyStatus`)
```ts
useEffect(() => {
  if (dutyStatus !== 'on_duty') {
    warningShownRef.current = false;
    checkCounterRef.current = 0;
    setShowInactivityWarning(false);
    return;
  }

  warningShownRef.current = false;
  checkCounterRef.current = 0;

  const intervalId = setInterval(async () => {
    checkCounterRef.current += 1;

    // Every 5th tick (~5 min): get GPS and check movement
    if (checkCounterRef.current % 5 === 0 && !previewMode) {
      try {
        const fix = await getCurrentLocationFix();
        const assignedLocation = profile?.assignedLocation;
        let distanceFromAssignedSite: number | null = null;
        let withinGeoFence = true;
        if (assignedLocation?.latitude != null && assignedLocation.longitude != null) {
          distanceFromAssignedSite = calculateDistanceMeters(
            fix.coords.latitude, fix.coords.longitude,
            assignedLocation.latitude, assignedLocation.longitude,
          );
          withinGeoFence = distanceFromAssignedSite <= assignedLocation.geoFenceRadius;
        }
        const snapshot: GuardLocationSnapshot = {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          capturedAt: new Date().toISOString(),
          distanceFromAssignedSite,
          withinGeoFence,
        };
        await updatePatrolLocation(snapshot); // resets patrol clock if moved >10m
      } catch { /* GPS unavailable, rely on manual reset */ }
    }

    // Check time thresholds
    const currentState = useGuardStore.getState();
    const elapsed = currentState.lastPatrolResetAt
      ? Date.now() - new Date(currentState.lastPatrolResetAt).getTime()
      : 0;

    if (elapsed >= 30 * 60 * 1000) {
      // 30 min — trigger inactivity SOS
      try {
        const loc = currentState.lastKnownLocation;
        await triggerSos({
          alertType: 'inactivity',
          note: 'Auto-inactivity: no patrol movement detected for 30 minutes.',
          location: loc,
          photoUri: null,
        });
        await resetPatrolClock();
        setShowInactivityWarning(false);
        warningShownRef.current = false;
      } catch { /* silent */ }
    } else if (elapsed >= 25 * 60 * 1000 && !warningShownRef.current) {
      // 25 min — vibration warning
      warningShownRef.current = true;
      Vibration.vibrate([500, 200, 500, 200, 500]);
      setShowInactivityWarning(true);
    }
  }, 60_000); // every 60 seconds

  return () => {
    clearInterval(intervalId);
    warningShownRef.current = false;
    checkCounterRef.current = 0;
  };
}, [dutyStatus]);
```

### Effect C — SOS location streaming (depends on active SOS alert ID)
```ts
const activeSosEvent = useMemo(
  () => sosEvents.find((e) => e.streamingActive && e.panicAlertId) ?? null,
  [sosEvents],
);

useEffect(() => {
  if (!activeSosEvent?.panicAlertId || previewMode) return;
  const alertId = activeSosEvent.panicAlertId;
  const eventId = activeSosEvent.id;

  const intervalId = setInterval(async () => {
    try {
      const fix = await getCurrentLocationFix();
      const snapshot: GuardLocationSnapshot = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        capturedAt: new Date().toISOString(),
        distanceFromAssignedSite: null,
        withinGeoFence: true,
      };
      await rememberLocation(snapshot);
      await streamPanicAlertLocation(alertId, snapshot);
      const status = await fetchPanicAlertStatus(alertId);
      if (status === 'resolved') {
        stopSosStreaming(eventId);
      }
    } catch { /* silent */ }
  }, 30_000);

  return () => clearInterval(intervalId);
}, [activeSosEvent?.panicAlertId]);
```

### UI — Inactivity warning banner
Insert **between** the duty status `InfoCard` and the SOS button `Pressable`:

```tsx
{showInactivityWarning && (
  <View style={[styles.inactivityWarning, { backgroundColor: colors.warning, borderColor: colors.warning }]}>
    <AlertTriangle color={colors.warningForeground} size={20} />
    <Text style={[styles.inactivityWarningText, { color: colors.warningForeground }]}>
      Inactivity warning — SOS will be sent in 5 minutes. Press "I am on duty" to reset.
    </Text>
  </View>
)}
```

Add to `StyleSheet.create`:
```ts
inactivityWarning: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: Spacing.sm,
  borderRadius: BorderRadius['2xl'],
  borderWidth: 1,
  padding: Spacing.base,
},
inactivityWarningText: {
  flex: 1,
  fontFamily: FontFamily.sansMedium,
  fontSize: FontSize.sm,
  lineHeight: 20,
},
```

### Update "I am on duty" button handler
The existing handler calls `resetPatrolClock()`. Wrap it:
```ts
const handlePatrolReset = async () => {
  await resetPatrolClock();
  setShowInactivityWarning(false);
  warningShownRef.current = false;
};
```
Replace `onPress={() => void resetPatrolClock()}` with `onPress={() => void handlePatrolReset()}`.

---

## Step 8 — Modify `src/screens/guard/GuardChecklistScreen.tsx`

Add import:
```ts
import { cancelChecklistReminder } from '../../lib/notifications';
```

Add effect at the top of the component body:
```ts
useEffect(() => {
  void cancelChecklistReminder().catch(() => {});
}, []);
```

---

## Step 9 — Modify `src/navigation/GuardNavigator.tsx`

Add imports:
```ts
import { fetchGuardEmergencyContacts, isPreviewProfile } from '../lib/mobileBackend';
```

Add new selector in component:
```ts
const hydrateEmergencyContacts = useGuardStore((state) => state.hydrateEmergencyContacts);
```

Add second `useEffect` after the existing bootstrap effect:
```ts
useEffect(() => {
  if (!hasHydrated || !profile || isPreviewProfile(profile)) return;
  fetchGuardEmergencyContacts()
    .then((contacts) => {
      if (contacts.length) hydrateEmergencyContacts(contacts);
    })
    .catch(() => {});
}, [hasHydrated, profile?.userId]);
```

---

## Files Changed Summary

| File | Type |
|---|---|
| `src/lib/patrolTask.ts` | **NEW** |
| `index.ts` | Add `definePatrolTask()` call |
| `src/types/guard.ts` | Add `lastMovementLocation` field |
| `src/store/useGuardStore.ts` | 3 new actions; wire clockIn/clockOut/submitChecklist |
| `src/lib/notifications.ts` | Add `scheduleChecklistReminder` / `cancelChecklistReminder` |
| `src/lib/mobileBackend.ts` | Add `streamPanicAlertLocation`, `fetchPanicAlertStatus`, `fetchGuardEmergencyContacts` |
| `src/screens/guard/GuardHomeScreen.tsx` | 3 new effects + warning banner UI + style entries |
| `src/screens/guard/GuardChecklistScreen.tsx` | Cancel reminder on mount |
| `src/navigation/GuardNavigator.tsx` | Fetch and hydrate contacts post-bootstrap |

---

## Reused Utilities (Do Not Duplicate)

- `calculateDistanceMeters` — `src/lib/location.ts`
- `getCurrentLocationFix` — `src/lib/location.ts`
- `normalizeAlertStatus` — already in `src/lib/mobileBackend.ts` (reuse for fetchPanicAlertStatus)
- `triggerSos`, `resetPatrolClock`, `rememberLocation` — `useGuardStore`
- `startGuardPanicAlert` — `src/lib/mobileBackend.ts` (already handles `alertType: 'inactivity'`)

---

## Verification Checklist

- [ ] Clock in → logcat/console shows `startLocationUpdatesAsync` registered (Android)
- [ ] Simulate 25 min inactivity (set PatrolMeta timestamp manually) → local notification fires; warning banner appears in-app
- [ ] Press "I am on duty" → banner dismisses, `lastPatrolResetAt` updates
- [ ] Simulate 30 min inactivity → `triggerSos` called with `alertType: 'inactivity'`; inactivity SOS appears in `sosEvents`
- [ ] Clock out → `stopLocationUpdatesAsync` called, `@guard_patrol_meta` cleared
- [ ] Open Checklist tab → `getAllScheduledNotificationsAsync` no longer contains `guard-checklist-9am`
- [ ] Clock in → `getAllScheduledNotificationsAsync` contains `guard-checklist-9am` with daily 9 AM trigger
- [ ] Submit checklist → scheduled reminder is cancelled
- [ ] Trigger SOS → network calls to `update_panic_alert_location` every 30s visible in logs
- [ ] Resolve SOS from Oversight → streaming interval clears, `streamingActive = false`
- [ ] Live backend login → emergency contacts show manager-configured values (not hardcoded)
