import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface CapturePhotoOptions {
  cameraType?: 'front' | 'back';
  source?: 'camera' | 'gallery';
  allowsEditing?: boolean;
  aspect?: [number, number];
}

export async function capturePhoto(options: CapturePhotoOptions = {}) {
  const source = options.source ?? 'camera';

  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === 'camera'
        ? 'Camera access is required to complete this action.'
        : 'Gallery access is required to complete this action.'
    );
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: options.allowsEditing ?? true,
          aspect: options.aspect ?? [1, 1],
          cameraType:
            options.cameraType === 'front'
              ? ImagePicker.CameraType.front
              : ImagePicker.CameraType.back,
          quality: 1, // Capture full quality, then compress specifically
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: options.allowsEditing ?? true,
          aspect: options.aspect ?? [1, 1],
          quality: 1,
        });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];

  const manipulated = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: Math.min(asset.width, 1080) } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    ...asset,
    uri: manipulated.uri,
    width: manipulated.width,
    height: manipulated.height,
  };
}
