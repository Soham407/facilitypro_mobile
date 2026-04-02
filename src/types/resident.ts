export type ResidentVisitorApprovalStatus = 'pending' | 'approved' | 'denied' | 'timed_out';

export interface ResidentPendingVisitor {
  id: string;
  visitorName: string;
  phone: string;
  purpose: string;
  flatId: string | null;
  flatLabel: string;
  vehicleNumber: string;
  photoUrl: string | null;
  entryTime: string;
  approvalStatus: ResidentVisitorApprovalStatus;
  approvalDeadlineAt: string | null;
  isFrequentVisitor: boolean;
  rejectionReason: string | null;
}
