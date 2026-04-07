import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from './ActionButton';
import { InfoCard } from './InfoCard';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getRouteLabel } from '../../lib/notifications';
import { useAppStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import type { NotificationRoute } from '../../types/notifications';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface NotificationAction {
  label: string;
  route: NotificationRoute;
  variant?: ButtonVariant;
}

interface NotificationInboxCardProps {
  title?: string;
  description?: string;
  actions?: NotificationAction[];
  maxItems?: number;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export function NotificationInboxCard({
  title = 'Notification centre',
  description = 'Notification records are stored here so each role can track live delivery state alongside local previews when needed.',
  actions = [],
  maxItems = 3,
}: NotificationInboxCardProps) {
  const { colors } = useAppTheme();
  const profile = useAppStore((state) => state.profile);
  const inbox = useNotificationStore((state) => state.inbox);
  const permissionStatus = useNotificationStore((state) => state.permissionStatus);
  const queuePreviewRoute = useNotificationStore((state) => state.queuePreviewRoute);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);

  const orderedInbox = useMemo(
    () =>
      [...inbox].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [inbox],
  );
  const unreadCount = useMemo(
    () => inbox.filter((entry) => entry.readAt === null).length,
    [inbox],
  );
  const visibleItems = orderedInbox.slice(0, maxItems);

  return (
    <InfoCard>
      <View style={styles.headerRow}>
        <View style={styles.copyWrap}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>{description}</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            Push permission: {permissionStatus}
          </Text>
        </View>
        <View style={styles.counterWrap}>
          <Text style={[styles.counterValue, { color: colors.foreground }]}>{unreadCount}</Text>
          <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>Unread</Text>
        </View>
      </View>

      {actions.length ? (
        <View style={styles.actionGroup}>
          {actions.map((action) => (
            <ActionButton
              key={`${action.route}-${action.label}`}
              label={action.label}
              variant={action.variant ?? 'secondary'}
              onPress={() => void queuePreviewRoute(action.route, profile)}
            />
          ))}
        </View>
      ) : null}

      {visibleItems.length ? (
        visibleItems.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => void markRead(item.id)}
            style={[
              styles.notificationRow,
              {
                borderColor: colors.border,
                backgroundColor: item.readAt ? colors.card : colors.secondary,
              },
            ]}
          >
            <View style={styles.copyWrap}>
              <Text style={[styles.notificationTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.caption, { color: colors.foreground }]}>{item.body}</Text>
              <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                {getRouteLabel(item.route)} | {item.priority} | {formatTimestamp(item.createdAt)}
              </Text>
              <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                {item.deliveryModes.join(' + ')}
                {item.fallbackState !== 'not_applicable'
                  ? item.fallbackState === 'sent'
                    ? ' | Sent via SMS'
                    : ` | SMS fallback ${item.fallbackState.replace(/_/g, ' ')}`
                  : ''}
              </Text>
            </View>
            <Text
              style={[
                styles.unreadBadge,
                { color: item.readAt ? colors.mutedForeground : colors.primary },
              ]}
            >
              {item.readAt ? 'Read' : 'New'}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          No notifications have been captured for this workspace yet.
        </Text>
      )}

      {inbox.length ? (
        <ActionButton label="Mark all read" variant="ghost" onPress={() => void markAllRead()} />
      ) : null}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  copyWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  caption: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  counterWrap: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  counterValue: {
    fontFamily: FontFamily.headingBold,
    fontSize: FontSize['2xl'],
    lineHeight: 28,
  },
  counterLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actionGroup: {
    gap: Spacing.base,
  },
  notificationRow: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
    padding: Spacing.base,
  },
  notificationTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  metaLine: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    lineHeight: 18,
    textTransform: 'capitalize',
  },
  unreadBadge: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
