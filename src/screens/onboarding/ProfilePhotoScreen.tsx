import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../../components/shared/ActionButton';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { uploadProfilePhoto } from '../../lib/profile';
import { useAppStore } from '../../store/useAppStore';
import { capturePhoto } from '../../lib/media';

export function ProfilePhotoScreen() {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const refreshProfile = useAppStore((state) => state.refreshProfile);
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedAutoCapture, setHasAttemptedAutoCapture] = useState(false);

  const handleCapture = async () => {
    setErrorMessage(null);

    try {
      const asset = await capturePhoto({
        cameraType: 'front',
        aspect: [1, 1],
      });

      if (asset) {
        setAssetUri(asset.uri);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not capture profile photo.');
    }
  };

  useEffect(() => {
    if (!hasAttemptedAutoCapture) {
      setHasAttemptedAutoCapture(true);
      void handleCapture();
    }
  }, [hasAttemptedAutoCapture]);

  const handleSave = async () => {
    if (!profile?.employeeId || !assetUri) {
      setErrorMessage('Please capture a profile photo before continuing.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await uploadProfilePhoto(profile.employeeId, assetUri);
      await refreshProfile();
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'We could not upload the profile photo.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenShell
      eyebrow="Guard setup"
      title="Capture profile photo"
      description="Security guards need a profile photo on file so selfie attendance and guard-side verification have a baseline to compare against."
      footer={
        <View style={styles.footer}>
          <ActionButton
            label={assetUri ? 'Save and continue' : 'Capture photo first'}
            loading={isSaving}
            disabled={!assetUri}
            onPress={handleSave}
          />
          <ActionButton label="Retake photo" variant="ghost" disabled={isSaving} onPress={() => void handleCapture()} />
        </View>
      }
    >
      <InfoCard>
        {assetUri ? (
          <Image source={{ uri: assetUri }} style={styles.preview} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
              Camera preview will appear here.
            </Text>
          </View>
        )}
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          We open the front camera automatically on this screen so onboarding stays fast at the gate.
        </Text>
        {errorMessage ? <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMessage}</Text> : null}
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: 12,
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius['2xl'],
  },
  placeholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  placeholderText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
