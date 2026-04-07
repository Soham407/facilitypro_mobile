import { StyleSheet, Text, View } from 'react-native';

import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { OversightGuardRecord } from '../../types/oversight';

interface LiveGuardBoardProps {
  guards: OversightGuardRecord[];
}

type MapsModule = typeof import('react-native-maps');

let cachedMapsModule: MapsModule | null | undefined;

function getMapsModule() {
  if (cachedMapsModule !== undefined) {
    return cachedMapsModule;
  }

  try {
    // react-native-maps throws during module load if the native binary does not include it yet.
    cachedMapsModule = require('react-native-maps') as MapsModule;
  } catch {
    cachedMapsModule = null;
  }

  return cachedMapsModule;
}

function getToneColor(status: OversightGuardRecord['status'], colors: ReturnType<typeof useAppTheme>['colors']) {
  switch (status) {
    case 'on_duty':
      return colors.success;
    case 'breach':
      return colors.destructive;
    case 'offline':
      return colors.warning;
    default:
      return colors.mutedForeground;
  }
}

export function LiveGuardBoard({ guards }: LiveGuardBoardProps) {
  const { colors, isDark } = useAppTheme();
  const positionedGuards = guards.filter(
    (guard) => typeof guard.latitude === 'number' && typeof guard.longitude === 'number',
  );
  const mapsModule = getMapsModule();

  if (!positionedGuards.length) {
    return (
      <View style={[styles.board, styles.emptyBoard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No live guard positions yet</Text>
        <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
          Guard markers will appear here after the first location snapshot reaches the oversight feed.
        </Text>
      </View>
    );
  }

  if (!mapsModule) {
    return (
      <View
        style={[
          styles.board,
          styles.emptyBoard,
          styles.fallbackBoard,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Map unavailable in this app build</Text>
        <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
          Live coordinates are available below. Rebuild the native app after installing the Expo-compatible maps package
          to restore the embedded map.
        </Text>

        <View style={styles.fallbackList}>
          {positionedGuards.map((guard) => {
            const toneColor = getToneColor(guard.status, colors);

            return (
              <View
                key={guard.id}
                style={[
                  styles.fallbackRow,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.fallbackDot, { backgroundColor: toneColor }]} />

                <View style={styles.fallbackContent}>
                  <Text style={[styles.fallbackName, { color: colors.foreground }]}>{guard.guardName}</Text>
                  <Text style={[styles.fallbackMeta, { color: colors.mutedForeground }]}>
                    {guard.assignedLocationName} - {guard.status.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.fallbackMeta, { color: colors.mutedForeground }]}>
                    {(guard.latitude as number).toFixed(5)}, {(guard.longitude as number).toFixed(5)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const { default: MapView, Marker } = mapsModule;

  const latitudes = positionedGuards.map((guard) => guard.latitude as number);
  const longitudes = positionedGuards.map((guard) => guard.longitude as number);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const centerLat = (minLatitude + maxLatitude) / 2;
  const centerLng = (minLongitude + maxLongitude) / 2;
  const latDelta = Math.max(maxLatitude - minLatitude + 0.002, 0.005);
  const lngDelta = Math.max(maxLongitude - minLongitude + 0.002, 0.005);

  return (
    <View style={[styles.board, { borderColor: colors.border }]}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: latDelta,
          longitudeDelta: lngDelta,
        }}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
      >
        {positionedGuards.map((guard) => {
          const toneColor = getToneColor(guard.status, colors);

          return (
            <Marker
              key={guard.id}
              coordinate={{
                latitude: guard.latitude as number,
                longitude: guard.longitude as number,
              }}
              title={guard.guardName}
              description={`${guard.assignedLocationName} - ${guard.status.replace(/_/g, ' ')}`}
            >
              <View style={styles.pinWrap}>
                <View style={[styles.pin, { backgroundColor: toneColor }]}>
                  <Text style={[styles.pinLabel, { color: colors.primaryForeground }]}>
                    {guard.guardName
                      .split(' ')
                      .map((segment) => segment[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    minHeight: 260,
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  emptyBoard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  fallbackBoard: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingVertical: Spacing.xl,
  },
  fallbackList: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  fallbackRow: {
    alignItems: 'center',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fallbackDot: {
    borderRadius: BorderRadius.full,
    height: 12,
    width: 12,
  },
  fallbackContent: {
    flex: 1,
    gap: 2,
  },
  fallbackName: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  fallbackMeta: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
  },
  pinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  pin: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  emptyTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  emptyCopy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
});
