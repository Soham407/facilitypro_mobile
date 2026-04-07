import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, MapPin, Navigation, Map } from 'lucide-react-native';
import * as Location from 'expo-location';

import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  calculateDistanceMeters,
  getCurrentLocationFix,
  requestGeoFencePermissions,
  type GeoPermissionState,
} from '../../lib/location';
import { fetchCompanyLocations } from '../../lib/profile';
import { useAppStore } from '../../store/useAppStore';

export function GeoFenceCalibrationScreen() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const completeGeoCalibration = useAppStore((state) => state.completeGeoCalibration);
  const [locations, setLocations] = useState<Array<Awaited<ReturnType<typeof fetchCompanyLocations>>[number]>>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<GeoPermissionState | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    async function loadLocations() {
      try {
        const nextLocations = await fetchCompanyLocations();
        setLocations(nextLocations);

        if (profile?.assignedLocation?.id) {
          setSelectedLocationId(profile.assignedLocation.id);
          return;
        }

        setSelectedLocationId(nextLocations[0]?.id ?? null);
      } catch (error) {
        const nextMessage =
          error instanceof Error ? error.message : 'We could not load company locations.';
        setErrorMessage(nextMessage);
      }
    }

    void loadLocations();
  }, [profile?.assignedLocation?.id]);

  useEffect(() => {
    if (!permissionState?.foregroundGranted) return;

    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 5000 },
          (location) => {
            setCurrentPosition({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      } catch {
        // Fallback to manual refresh if watching fails
      }
    })();

    return () => {
      subscription?.remove();
    };
  }, [permissionState?.foregroundGranted]);

  const selectedLocation = useMemo(
    () =>
      locations.find((location) => location.id === selectedLocationId) ?? profile?.assignedLocation ?? null,
    [locations, profile?.assignedLocation, selectedLocationId],
  );

  const distanceFromSite =
    currentPosition &&
    selectedLocation &&
    selectedLocation.latitude != null &&
    selectedLocation.longitude != null
      ? calculateDistanceMeters(
          currentPosition.latitude,
          currentPosition.longitude,
          selectedLocation.latitude,
          selectedLocation.longitude,
        )
      : null;

  const needsBackgroundPermission = Platform.OS === 'android' || Platform.OS === 'ios';
  const isWithinFence = distanceFromSite !== null && distanceFromSite <= (selectedLocation?.geoFenceRadius ?? 50);

  const canProceedToStep2 = selectedLocation !== null;
  const canProceedToStep3 =
    Boolean(permissionState?.foregroundGranted) &&
    (!needsBackgroundPermission || Boolean(permissionState?.backgroundGranted)) &&
    Boolean(currentPosition) &&
    Boolean(selectedLocation) &&
    isWithinFence;

  const handleRefreshLocation = async () => {
    setIsRequestingLocation(true);
    setErrorMessage(null);

    try {
      const nextPermissions = await requestGeoFencePermissions();
      setPermissionState(nextPermissions);

      if (!nextPermissions.foregroundGranted) {
        setErrorMessage('Foreground location access is required for attendance geo-fencing.');
        return;
      }

      if (needsBackgroundPermission && !nextPermissions.backgroundGranted) {
        setErrorMessage('Background location access is required for patrol and inactivity monitoring.');
        return;
      }

      const fix = await getCurrentLocationFix();
      setCurrentPosition({
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'We could not capture your current location.';
      setErrorMessage(nextMessage);
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedLocation || !currentPosition) {
      setErrorMessage('We need both a site and your live location before calibration can finish.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await completeGeoCalibration({
        calibratedAt: new Date().toISOString(),
        latitude: currentPosition.latitude,
        locationId: selectedLocation.id,
        locationName: selectedLocation.locationName,
        longitude: currentPosition.longitude,
        radius: selectedLocation.geoFenceRadius,
      });
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'We could not save the geo-fence calibration.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const renderFooter = () => {
    if (step === 1) {
      return (
        <View style={styles.footer}>
          <ActionButton
            label="Next: Verify location"
            disabled={!canProceedToStep2}
            onPress={() => {
              setStep(2);
              void handleRefreshLocation();
            }}
          />
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.footer}>
          <ActionButton
            label={currentPosition ? 'Refresh live location' : 'Grant access and locate me'}
            loading={isRequestingLocation}
            onPress={() => void handleRefreshLocation()}
          />
          <ActionButton
            label="Next: Confirm"
            variant="secondary"
            disabled={!canProceedToStep3}
            onPress={() => setStep(3)}
          />
          <ActionButton
            label="Back"
            variant="ghost"
            onPress={() => setStep(1)}
          />
          {permissionState && (!permissionState.canAskAgain || !permissionState.foregroundGranted) ? (
            <ActionButton label="Open device settings" variant="ghost" onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.footer}>
        <ActionButton
          label="Lock geo-fence and complete"
          loading={isSaving}
          onPress={() => void handleComplete()}
        />
        <ActionButton
          label="Back"
          variant="ghost"
          disabled={isSaving}
          onPress={() => setStep(2)}
        />
      </View>
    );
  };

  return (
    <ScreenShell
      eyebrow={`Step ${step} of 3`}
      title="Calibrate work location"
      description="Stand at your primary work site and capture a live location fix. We use this baseline to enforce clock-in geo-fences and future background monitoring."
      footer={renderFooter()}
    >
      {errorMessage ? (
        <InfoCard>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMessage}</Text>
        </InfoCard>
      ) : null}

      {step === 1 ? (
        <InfoCard>
          <View style={styles.locationHeader}>
            <Map color={colors.primary} size={24} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Select your primary site</Text>
          </View>
          <Text style={[styles.statusText, { color: colors.mutedForeground, marginBottom: Spacing.sm }]}>
            Choose the location you will be working at from the list below.
          </Text>
          <View style={styles.locationList}>
            {locations.map((location) => {
              const isSelected = location.id === selectedLocationId;

              return (
                <Pressable
                  key={location.id}
                  onPress={() => setSelectedLocationId(location.id)}
                  style={[
                    styles.locationChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.secondary,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.locationChipText,
                      { color: isSelected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {location.locationName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </InfoCard>
      ) : null}

      {step === 2 ? (
        <InfoCard>
          <View style={styles.locationHeader}>
            <Navigation color={colors.info} size={24} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Walk inside the geo-fence</Text>
          </View>
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            {selectedLocation
              ? `You are calibrating against ${selectedLocation.locationName} (radius: ${selectedLocation.geoFenceRadius}m).`
              : 'Choose a location to continue.'}
          </Text>
          {currentPosition ? (
            <View style={[styles.wizardBanner, { backgroundColor: isWithinFence ? colors.success : colors.destructive }]}>
              <Text style={[styles.wizardBannerText, { color: isWithinFence ? colors.successForeground : colors.destructiveForeground }]}>
                {isWithinFence ? 'Ready! You are within the allowed area.' : 'Move closer to the site. You are outside the fence.'}
              </Text>
              <Text style={[styles.wizardBannerText, { color: isWithinFence ? colors.successForeground : colors.destructiveForeground }]}>
                Distance: {distanceFromSite ?? '—'}m
              </Text>
            </View>
          ) : (
            <View style={[styles.wizardBanner, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.wizardBannerText, { color: colors.foreground }]}>
                Waiting for GPS fix... Grant permissions if prompted.
              </Text>
            </View>
          )}
        </InfoCard>
      ) : null}

      {step === 3 ? (
        <InfoCard>
          <View style={styles.locationHeader}>
            <CheckCircle2 color={colors.success} size={24} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ready to lock calibration</Text>
          </View>
          <Text style={[styles.statusText, { color: colors.foreground }]}>
            Site: {selectedLocation?.locationName}
          </Text>
          <Text style={[styles.statusText, { color: colors.foreground }]}>
            Distance from center: {distanceFromSite}m
          </Text>
          <Text style={[styles.statusText, { color: colors.mutedForeground, marginTop: Spacing.sm }]}>
            By completing this step, your device will be linked to this location for attendance and patrol monitoring.
          </Text>
        </InfoCard>
      ) : null}

    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: 12,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  locationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  locationChip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  locationChipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  statusText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  wizardBanner: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  wizardBannerText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});