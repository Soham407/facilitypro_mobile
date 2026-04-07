import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { FileText, WalletCards } from 'lucide-react-native';

import { MetricCard } from '../../components/guard/MetricCard';
import { StatusChip } from '../../components/guard/StatusChip';
import { ActionButton } from '../../components/shared/ActionButton';
import { FormField } from '../../components/shared/FormField';
import { InfoCard } from '../../components/shared/InfoCard';
import { ScreenShell } from '../../components/shared/ScreenShell';
import { Spacing } from '../../constants/spacing';
import { FontFamily, FontSize } from '../../constants/typography';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { BuyerTabParamList } from '../../navigation/types';
import { useBuyerStore } from '../../store/useBuyerStore';
import type { BuyerInvoiceRecord } from '../../types/commerce';

type BuyerInvoicesScreenProps = BottomTabScreenProps<BuyerTabParamList, 'BuyerInvoices'>;

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatValue(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getStatusTone(status: BuyerInvoiceRecord['status']) {
  if (status === 'acknowledged') {
    return 'success';
  }

  if (status === 'disputed') {
    return 'danger';
  }

  return 'info';
}

function getPaymentTone(status: BuyerInvoiceRecord['paymentStatus']) {
  if (status === 'paid') {
    return 'success';
  }

  if (status === 'partial') {
    return 'warning';
  }

  return 'danger';
}

export function BuyerInvoicesScreen(_props: BuyerInvoicesScreenProps) {
  const { colors } = useAppTheme();
  const invoices = useBuyerStore((state) => state.invoices);
  const acknowledgeInvoice = useBuyerStore((state) => state.acknowledgeInvoice);
  const disputeInvoice = useBuyerStore((state) => state.disputeInvoice);
  const [message, setMessage] = useState<string | null>(null);
  const [disputeDrafts, setDisputeDrafts] = useState<Record<string, string>>({});

  const totalAmount = useMemo(
    () => invoices.reduce((sum, invoice) => sum + invoice.totalAmountPaise, 0),
    [invoices],
  );
  const totalOutstanding = useMemo(
    () => invoices.reduce((sum, invoice) => sum + invoice.dueAmountPaise, 0),
    [invoices],
  );
  const disputedCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === 'disputed').length,
    [invoices],
  );
  const orderedInvoices = useMemo(
    () =>
      [...invoices].sort(
        (left, right) => new Date(right.invoiceDate).getTime() - new Date(left.invoiceDate).getTime(),
      ),
    [invoices],
  );

  return (
    <ScreenShell
      eyebrow="Buyer Invoices"
      title="Invoice acknowledgement and dispute desk"
      description="Stay on top of supplier billing, acknowledge clean invoices quickly, and raise issues before finance closes the cycle."
    >
      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<FileText color={colors.primary} size={20} />}
            label="Total invoices"
            value={String(invoices.length)}
            caption="Buyer-side billing ledger"
          />
        </View>
        <View style={styles.metricCell}>
          <MetricCard
            icon={<WalletCards color={colors.warning} size={20} />}
            label="Outstanding"
            value={currencyFormatter.format(totalOutstanding / 100)}
            caption={`${disputedCount} disputed invoice${disputedCount === 1 ? '' : 's'}`}
          />
        </View>
      </View>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Invoice summary</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          Total billed value in this mobile preview: {currencyFormatter.format(totalAmount / 100)}.
        </Text>
        {message ? <Text style={[styles.caption, { color: colors.primary }]}>{message}</Text> : null}
      </InfoCard>

      <InfoCard>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Invoice queue</Text>
        {orderedInvoices.length ? (
          orderedInvoices.map((invoice) => (
            <View key={invoice.id} style={styles.invoiceCard}>
              <View style={styles.headerRow}>
                <View style={styles.copyWrap}>
                  <Text style={[styles.invoiceTitle, { color: colors.foreground }]}>
                    {invoice.invoiceNumber}
                  </Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {invoice.supplierName} | Invoice date {formatValue(invoice.invoiceDate)}
                  </Text>
                </View>
                <View style={styles.statusWrap}>
                  <StatusChip label={invoice.status} tone={getStatusTone(invoice.status)} />
                  <StatusChip label={invoice.paymentStatus} tone={getPaymentTone(invoice.paymentStatus)} />
                </View>
              </View>
              <Text style={[styles.caption, { color: colors.foreground }]}>
                Total: {currencyFormatter.format(invoice.totalAmountPaise / 100)} | Due: {currencyFormatter.format(invoice.dueAmountPaise / 100)}
              </Text>
              <Text style={[styles.caption, { color: colors.foreground }]}>
                Due date: {formatValue(invoice.dueDate)}
              </Text>
              {invoice.note ? (
                <Text style={[styles.caption, { color: colors.foreground }]}>{invoice.note}</Text>
              ) : null}
              <FormField
                helperText="Optional note while raising a dispute."
                label="Dispute note"
                onChangeText={(value) =>
                  setDisputeDrafts((state) => ({
                    ...state,
                    [invoice.id]: value,
                  }))
                }
                placeholder="Mismatch in rate, quantity, or service period"
                value={disputeDrafts[invoice.id] ?? ''}
              />
              <View style={styles.actionGroup}>
                <ActionButton
                  label="Acknowledge"
                  variant="secondary"
                  disabled={invoice.status !== 'sent'}
                  onPress={() => {
                    void acknowledgeInvoice(invoice.id);
                    setMessage(`Invoice ${invoice.invoiceNumber} acknowledged from mobile.`);
                  }}
                />
                <ActionButton
                  label="Download PDF"
                  variant="ghost"
                  onPress={() => {
                    // Logic to open invoice URL or show placeholder
                    setMessage(`Opening PDF for ${invoice.invoiceNumber}...`);
                  }}
                />
                <ActionButton
                  label="Raise dispute"
                  variant="ghost"
                  disabled={invoice.status === 'disputed'}
                  onPress={() => {
                    void disputeInvoice(invoice.id, disputeDrafts[invoice.id] ?? '');
                    setMessage(`Invoice ${invoice.invoiceNumber} moved into dispute review.`);
                  }}
                />
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            No supplier invoices have reached the buyer ledger yet.
          </Text>
        )}
      </InfoCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.base,
  },
  metricCell: {
    flex: 1,
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
  invoiceCard: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.base,
    justifyContent: 'space-between',
  },
  copyWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  invoiceTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.base,
  },
  statusWrap: {
    gap: Spacing.sm,
  },
  actionGroup: {
    gap: Spacing.base,
  },
});
