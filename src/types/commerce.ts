import type { AppRole } from './app';

export type CommerceRole = Extract<AppRole, 'buyer' | 'supplier' | 'vendor'>;

export type CommercePriority = 'low' | 'medium' | 'high';
export type BuyerRequestStatus =
  | 'pending'
  | 'indent_forwarded'
  | 'po_issued'
  | 'po_received'
  | 'po_dispatched'
  | 'material_received'
  | 'bill_generated'
  | 'feedback_pending'
  | 'completed'
  | 'indent_rejected';
export type BuyerInvoiceStatus = 'draft' | 'sent' | 'acknowledged' | 'disputed';
export type BuyerPaymentStatus = 'unpaid' | 'partial' | 'paid';
export type SupplierIndentStatus =
  | 'indent_forwarded'
  | 'indent_rejected'
  | 'po_issued'
  | 'po_received'
  | 'po_dispatched'
  | 'bill_generated';
export type SupplierPOStatus =
  | 'sent_to_vendor'
  | 'acknowledged'
  | 'dispatched'
  | 'partial_received'
  | 'received';
export type SupplierBillStatus = 'submitted' | 'approved' | 'paid';

export interface BuyerRequestItem {
  id: string;
  label: string;
  quantity: number;
  unit: string;
}

export interface BuyerRequestRecord {
  id: string;
  requestNumber: string;
  title: string;
  description: string | null;
  categoryLabel: string;
  locationName: string;
  preferredDeliveryDate: string | null;
  priority: CommercePriority;
  status: BuyerRequestStatus;
  createdAt: string;
  supplierName: string | null;
  items: BuyerRequestItem[];
}

export interface BuyerInvoiceRecord {
  id: string;
  requestId: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmountPaise: number;
  dueAmountPaise: number;
  status: BuyerInvoiceStatus;
  paymentStatus: BuyerPaymentStatus;
  invoiceDate: string;
  dueDate: string | null;
  note: string | null;
}

export interface BuyerFeedbackRecord {
  id: string;
  requestId: string;
  requestNumber: string;
  rating: number;
  note: string;
  submittedAt: string;
}

export interface BuyerPersistedState {
  ownerUserId: string | null;
  role: 'buyer';
  requests: BuyerRequestRecord[];
  invoices: BuyerInvoiceRecord[];
  feedback: BuyerFeedbackRecord[];
  refreshedAt: string | null;
}

export interface SupplierIndentRecord {
  id: string;
  requestNumber: string;
  title: string;
  categoryLabel: string;
  locationName: string;
  preferredDeliveryDate: string | null;
  status: SupplierIndentStatus;
  createdAt: string;
  itemSummary: string;
}

export interface SupplierPORecord {
  id: string;
  indentId: string;
  poNumber: string;
  title: string;
  grandTotalPaise: number;
  expectedDeliveryDate: string | null;
  status: SupplierPOStatus;
  vehicleDetails: string | null;
  dispatchNotes: string | null;
  proofOfDeliveryUri: string | null;
  createdAt: string;
}

export interface SupplierBillRecord {
  id: string;
  poId: string;
  poNumber: string;
  billNumber: string;
  totalAmountPaise: number;
  status: SupplierBillStatus;
  paymentStatus: BuyerPaymentStatus;
  createdAt: string;
  note: string | null;
}

export interface SupplierPersistedState {
  ownerUserId: string | null;
  role: Extract<CommerceRole, 'supplier' | 'vendor'>;
  indents: SupplierIndentRecord[];
  pos: SupplierPORecord[];
  bills: SupplierBillRecord[];
  refreshedAt: string | null;
}
