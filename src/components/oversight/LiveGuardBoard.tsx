import { StyleSheet, Text, View } from 'react-native';

import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { OversightGuardRecord } from '../../types/oversight';

interface LiveGuardBoardProps {
  guards: OversightGuardRecord[];
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
  const { colors } = useAppTheme();
  const positionedGuards = guards.filter(
    (guard) => typeof guard.latitude === 'number' && typeof guard.longitude === 'number',
  );

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

  const latitudes = positionedGuards.map((guard) => guard.latitude as number);
  const longitudes = positionedGuards.map((guard) => guard.longitude as number);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = maxLatitude - minLatitude || 0.001;
  const longitudeRange = maxLongitude - minLongitude || 0.001;

  return (
    <View style={[styles.board, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Text style={[styles.boardLabel, { color: colors.mutedForeground }]}>North</Text>
      <Text style={[styles.sideLabel, { color: colors.mutedForeground }]}>West</Text>
      <Text style={[styles.sideLabelRight, { color: colors.mutedForeground }]}>East</Text>
      <Text style={[styles.boardLabelBottom, { color: colors.mutedForeground }]}>South</Text>

      {positionedGuards.map((guard) => {
        const top = 12 + (((guard.latitude as number) - minLatitude) / latitudeRange) * 76;
        const left = 10 + (((guard.longitude as number) - minLongitude) / longitudeRange) * 80;
        const toneColor = getToneColor(guard.status, colors);

        return (
          <View
            key={guard.id}
            style={[
              styles.pinWrap,
              {
                top: `${top}%`,
                left: `${left}%`,
              },
            ]}
          >
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
            <Text style={[styles.guardLabel, { color: colors.foreground }]} numberOfLines={1}>
              {guard.guardName}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    minHeight: 260,
    borderRadius: BorderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  emptyBoard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  boardLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    left: Spacing.base,
    position: 'absolute',
    top: Spacing.sm,
  },
  sideLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    left: Spacing.base,
    position: 'absolute',
    top: '50%',
  },
  sideLabelRight: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    position: 'absolute',
    right: Spacing.base,
    top: '50%',
  },
  boardLabelBottom: {
    bottom: Spacing.sm,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    left: Spacing.base,
    position: 'absolute',
  },
  pinWrap: {
    alignItems: 'center',
    marginLeft: -24,
    marginTop: -24,
    position: 'absolute',
    width: 68,
  },
  pin: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pinLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  guardLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    textAlign: 'center',
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
