import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { NotificationInboxCard } from '../../components/shared/NotificationInboxCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import type { ResidentTabParamList } from '../../navigation/types';

type ResidentNotificationsScreenProps = BottomTabScreenProps<
  ResidentTabParamList,
  'ResidentNotifications'
>;

export function ResidentNotificationsScreen(_props: ResidentNotificationsScreenProps) {
  return (
    <ScreenShell
      eyebrow="Resident Alerts"
      title="Notification history"
      description="Track gate approvals, pest-control advisories, and the rest of your resident-facing alert stream from one inbox."
    >
      <NotificationInboxCard
        title="Resident notification inbox"
        description="This inbox is powered by the live backend notification table and remains available even if push permission is denied."
        maxItems={12}
      />
    </ScreenShell>
  );
}
