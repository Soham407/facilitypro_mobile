import { create } from 'zustand';

import { loadSupplierState, saveSupplierState } from '../lib/commerceStorage';
import type { AppUserProfile } from '../types/app';
import type {
  SupplierBillRecord,
  SupplierIndentRecord,
  SupplierPORecord,
  SupplierPersistedState,
} from '../types/commerce';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPONumber() {
  return `PO-${new Date().getFullYear()}-${Math.random().toString().slice(2, 6)}`;
}

function createBillNumber() {
  return `BILL-${new Date().getFullYear()}-${Math.random().toString().slice(2, 6)}`;
}

function sortPOsByCreatedAt(pos: SupplierPORecord[]) {
  return [...pos].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function createDefaultIndents(profile: AppUserProfile | null): SupplierIndentRecord[] {
  const locationName = profile?.assignedLocation?.locationName ?? 'Preview Tower';

  return [
    {
      id: 'supplier-indent-1',
      requestNumber: 'REQ-2026-1201',
      title: 'Lobby housekeeping consumables',
      categoryLabel: 'Consumables',
      locationName,
      preferredDeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'indent_forwarded',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      itemSummary: 'Floor cleaner x24, garbage liners x60',
    },
    {
      id: 'supplier-indent-2',
      requestNumber: 'REQ-2026-1188',
      title: 'Security shift relief manpower',
      categoryLabel: 'Manpower',
      locationName,
      preferredDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'po_issued',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      itemSummary: 'Security guard headcount x2',
    },
  ];
}

function createDefaultPOs(): SupplierPORecord[] {
  return [
    {
      id: 'supplier-po-1',
      indentId: 'supplier-indent-2',
      poNumber: 'PO-2026-4501',
      title: 'Festival weekend manpower support',
      grandTotalPaise: 960000,
      expectedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'acknowledged',
      vehicleDetails: null,
      dispatchNotes: null,
      proofOfDeliveryUri: null,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function createDefaultBills(): SupplierBillRecord[] {
  return [
    {
      id: 'supplier-bill-1',
      poId: 'supplier-po-1',
      poNumber: 'PO-2026-4501',
      billNumber: 'BILL-2026-9011',
      totalAmountPaise: 720000,
      status: 'approved',
      paymentStatus: 'partial',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      note: 'Part-bill approved for the first staffing cycle.',
    },
  ];
}

function getSupplierRole(profile: AppUserProfile | null): SupplierPersistedState['role'] {
  return profile?.role === 'vendor' ? 'vendor' : 'supplier';
}

function createDefaultState(profile: AppUserProfile | null): SupplierPersistedState {
  return {
    ownerUserId: profile?.userId ?? null,
    role: getSupplierRole(profile),
    indents: createDefaultIndents(profile),
    pos: createDefaultPOs(),
    bills: createDefaultBills(),
    refreshedAt: new Date().toISOString(),
  };
}

function normalizeHydratedState(
  snapshot: SupplierPersistedState | null,
  profile: AppUserProfile | null,
): SupplierPersistedState {
  const fallback = createDefaultState(profile);

  if (
    !snapshot ||
    snapshot.ownerUserId !== profile?.userId ||
    snapshot.role !== getSupplierRole(profile)
  ) {
    return fallback;
  }

  return {
    ...fallback,
    ...snapshot,
    ownerUserId: profile?.userId ?? snapshot.ownerUserId,
    role: getSupplierRole(profile),
  };
}

interface SupplierStore extends SupplierPersistedState {
  hasHydrated: boolean;
  bootstrap: (profile: AppUserProfile | null) => Promise<void>;
  refreshPortal: () => Promise<void>;
  respondToIndent: (id: string, decision: 'accept' | 'reject') => Promise<void>;
  acknowledgePO: (id: string) => Promise<void>;
  dispatchPO: (id: string, input: { vehicleDetails: string; dispatchNotes: string; proofOfDeliveryUri?: string }) => Promise<void>;
  submitBill: (input: {
    poId: string;
    billNumber?: string;
    totalAmountPaise: number;
    note: string;
  }) => Promise<void>;
}

function buildPersistedState(state: SupplierStore): SupplierPersistedState {
  return {
    ownerUserId: state.ownerUserId,
    role: state.role,
    indents: state.indents,
    pos: state.pos,
    bills: state.bills,
    refreshedAt: state.refreshedAt,
  };
}

async function persistSupplierStore(get: () => SupplierStore) {
  await saveSupplierState(buildPersistedState(get()));
}

export const useSupplierStore = create<SupplierStore>((set, get) => ({
  ...createDefaultState(null),
  hasHydrated: false,

  bootstrap: async (profile) => {
    const storedState = await loadSupplierState();
    const hydratedState = normalizeHydratedState(storedState, profile);

    set({
      ...hydratedState,
      hasHydrated: true,
    });

    await saveSupplierState(hydratedState);
  },

  refreshPortal: async () => {
    const targetPoId = sortPOsByCreatedAt(get().pos).find((po) => po.status === 'dispatched')?.id;

    set((state) => ({
      refreshedAt: new Date().toISOString(),
      pos: state.pos.map((po) =>
        po.id === targetPoId && po.status === 'dispatched'
          ? {
              ...po,
              status: 'received',
            }
          : po,
      ),
    }));

    await persistSupplierStore(get);
  },

  respondToIndent: async (id, decision) => {
    const targetIndent = get().indents.find((indent) => indent.id === id);

    if (!targetIndent || targetIndent.status !== 'indent_forwarded') {
      return;
    }

    set((state) => ({
      indents: state.indents.map((indent) =>
        indent.id === id
          ? {
              ...indent,
              status: decision === 'accept' ? 'po_issued' : 'indent_rejected',
            }
          : indent,
      ),
      pos:
        decision === 'accept'
          ? [
              {
                id: createId('supplier-po'),
                indentId: id,
                poNumber: createPONumber(),
                title: targetIndent.title,
                grandTotalPaise: 560000,
                expectedDeliveryDate: targetIndent.preferredDeliveryDate,
                status: 'sent_to_vendor',
                vehicleDetails: null,
                dispatchNotes: null,
                proofOfDeliveryUri: null,
                createdAt: new Date().toISOString(),
              },
              ...state.pos,
            ]
          : state.pos,
      refreshedAt: new Date().toISOString(),
    }));

    await persistSupplierStore(get);
  },

  acknowledgePO: async (id) => {
    set((state) => ({
      pos: state.pos.map((po) =>
        po.id === id
          ? {
              ...po,
              status: 'acknowledged',
            }
          : po,
      ),
      indents: state.indents.map((indent) =>
        state.pos.find((po) => po.id === id)?.indentId === indent.id
          ? {
              ...indent,
              status: 'po_received',
            }
          : indent,
      ),
      refreshedAt: new Date().toISOString(),
    }));

    await persistSupplierStore(get);
  },

  dispatchPO: async (id, input) => {
    const vehicleDetails = input.vehicleDetails.trim();
    const dispatchNotes = input.dispatchNotes.trim();
    const targetPo = get().pos.find((po) => po.id === id);

    if (!targetPo) {
      return;
    }

    set((state) => ({
      pos: state.pos.map((po) =>
        po.id === id
          ? {
              ...po,
              status: 'dispatched',
              vehicleDetails: vehicleDetails || 'Shared vehicle',
              dispatchNotes: dispatchNotes || null,
              proofOfDeliveryUri: input.proofOfDeliveryUri || null,
            }
          : po,
      ),
      indents: state.indents.map((indent) =>
        indent.id === targetPo.indentId
          ? {
              ...indent,
              status: 'po_dispatched',
            }
          : indent,
      ),
      refreshedAt: new Date().toISOString(),
    }));

    await persistSupplierStore(get);
  },

  submitBill: async (input) => {
    const targetPo = get().pos.find((po) => po.id === input.poId);

    if (!targetPo) {
      return;
    }

    set((state) => ({
      bills: [
        {
          id: createId('supplier-bill'),
          poId: input.poId,
          poNumber: targetPo.poNumber,
          billNumber: input.billNumber?.trim() || createBillNumber(),
          totalAmountPaise: Math.max(0, Math.round(input.totalAmountPaise)),
          status: 'submitted',
          paymentStatus: 'unpaid',
          createdAt: new Date().toISOString(),
          note: input.note.trim() || null,
        },
        ...state.bills,
      ],
      indents: state.indents.map((indent) =>
        indent.id === targetPo.indentId
          ? {
              ...indent,
              status: 'bill_generated',
            }
          : indent,
      ),
      refreshedAt: new Date().toISOString(),
    }));

    await persistSupplierStore(get);
  },
}));
