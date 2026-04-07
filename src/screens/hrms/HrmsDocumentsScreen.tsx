import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { FileBadge2, Images, ShieldEllipsis } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { BorderRadius, Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fetchHrmsDocuments, getHrmsDocumentLabel, uploadHrmsDocument } from '../../lib/hrms';
import { capturePhoto } from '../../lib/media';
import type { HRMSTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import type { HrmsDocumentType } from '../../types/hrms';

type HrmsDocumentsScreenProps = BottomTabScreenProps<
  HRMSTabParamList,
  'HRMSDocuments'
>;

const DOCUMENT_TYPES: HrmsDocumentType[] = [
  'aadhar',
  'pan',
  'voter_id',
  'passport',
  'psara',
  'police_verification',
  'other',
];

export function HrmsDocumentsScreen(_props: HrmsDocumentsScreenProps) {
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const profile = useAppStore((state) => state.profile);
  const [documentType, setDocumentType] = useState<HrmsDocumentType>('aadhar');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [notes, setNotes] = useState('');

  const documentsQuery = useQuery({
    queryKey: ['hrms', 'documents', profile?.employeeId],
    queryFn: () => fetchHrmsDocuments(profile),
    enabled: Boolean(profile),
  });

  useEffect(() => {
    if (profile?.role === 'security_guard') {
      setDocumentType('psara');
    }
  }, [profile?.role]);

  const uploadMutation = useMutation({
    mutationFn: async (
      source: 'camera' | 'gallery',
    ) => {
      const asset = await capturePhoto({
        source,
        allowsEditing: true,
      });

      if (!asset) {
        throw new Error('Document selection was cancelled.');
      }

      return uploadHrmsDocument({
        documentNumber,
        documentType,
        issueDate,
        notes,
        profile,
        sourceUri: asset.uri,
      });
    },
    onSuccess: async () => {
      setDocumentNumber('');
      setIssueDate('');
      setNotes('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['hrms', 'documents', profile?.employeeId] }),
        queryClient.invalidateQueries({ queryKey: ['hrms', 'dashboard', profile?.employeeId, profile?.role] }),
      ]);
    },
  });

  return (
    <ScreenShell
      eyebrow="HRMS documents"
      title="Document vault"
      description="Store identity and compliance proofs in one vault so HR and supervisors can validate them without chasing paper copies."
      footer={
        <View style={styles.footer}>
          <ActionButton
            label="Capture from camera"
            loading={uploadMutation.isPending && uploadMutation.variables === 'camera'}
            onPress={() => uploadMutation.mutate('camera')}
          />
          <ActionButton
            label="Choose from gallery"
            variant="secondary"
            loading={uploadMutation.isPending && uploadMutation.variables === 'gallery'}
            onPress={() => uploadMutation.mutate('gallery')}
          />
        </View>
      }
    >
      <InfoCard>
        <View style={styles.headerRow}>
          <ShieldEllipsis color={colors.warning} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Upload slot</Text>
        </View>
        <View style={styles.chipWrap}>
          {DOCUMENT_TYPES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setDocumentType(item)}
              style={[
                styles.typeChip,
                {
                  backgroundColor: documentType === item ? colors.secondary : colors.card,
                  borderColor: colors.border,
                },
                documentType === item && styles.typeChipActive,
              ]}
            >
              <Text style={[styles.typeChipLabel, { color: colors.foreground }]}>
                {getHrmsDocumentLabel(item)}
              </Text>
            </Pressable>
          ))}
        </View>
        <FormField
          helperText="Optional but useful for audit and verification."
          label="Document number"
          onChangeText={setDocumentNumber}
          placeholder="Enter the visible document number"
          value={documentNumber}
        />
        <FormField
          helperText="Use `YYYY-MM-DD` when the card or certificate has an issue date."
          label="Issue date"
          onChangeText={setIssueDate}
          placeholder="2026-03-01"
          value={issueDate}
        />
        <FormField
          helperText="Add context like renewed copy, blurred back side, or replacement upload."
          label="Notes"
          multiline
          numberOfLines={3}
          onChangeText={setNotes}
          placeholder="Optional upload note"
          style={styles.multilineInput}
          textAlignVertical="top"
          value={notes}
        />
        {uploadMutation.error instanceof Error ? (
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            {uploadMutation.error.message}
          </Text>
        ) : null}
      </InfoCard>

      <InfoCard>
        <View style={styles.headerRow}>
          <FileBadge2 color={colors.info} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Stored documents</Text>
        </View>
        {documentsQuery.data?.length ? (
          documentsQuery.data.map((item) => (
            <View key={item.id} style={[styles.documentRow, { borderColor: colors.border }]}>
              <View style={styles.documentCopy}>
                <Text style={[styles.documentTitle, { color: colors.foreground }]}>
                  {getHrmsDocumentLabel(item.documentType)}
                </Text>
                <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>
                  {item.documentNumber ?? 'Document number not added'}
                </Text>
                <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>
                  {item.issueDate ? `Issued on ${item.issueDate}` : 'Issue date not recorded'}
                </Text>
                {item.notes ? (
                  <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>
              <View style={styles.documentMeta}>
                <Text style={[styles.statusText, { color: colors.foreground }]}>
                  {item.isVerified ? 'Verified' : 'Pending'}
                </Text>
                <Text style={[styles.syncText, { color: colors.info }]}>
                  {item.syncStatus === 'synced'
                    ? 'Synced'
                    : item.syncStatus === 'pending'
                      ? 'Queued locally'
                      : 'Preview'}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>
            Your first uploaded document will appear here.
          </Text>
        )}
      </InfoCard>

      <InfoCard>
        <View style={styles.headerRow}>
          <Images color={colors.success} size={22} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Security compliance note
          </Text>
        </View>
        <Text style={[styles.helperCopy, { color: colors.mutedForeground }]}>
          Guards can keep PSARA and Police Verification records here alongside identity documents so
          the compliance state is visible on mobile before reporting for duty.
        </Text>
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: Spacing.base,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeChip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  typeChipActive: {
    opacity: 0.9,
  },
  typeChipLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: Spacing.base,
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  documentRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: Spacing.base,
    paddingTop: Spacing.base,
  },
  documentCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  documentMeta: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  documentTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  helperCopy: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  statusText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  syncText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
});
