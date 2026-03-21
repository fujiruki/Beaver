import { create } from 'zustand';

interface VoucherStore {
  profitRate: number;
  setProfitRate: (r: number) => void;
  isDirty: boolean;
  setIsDirty: (v: boolean) => void;
}

export const useVoucherStore = create<VoucherStore>((set) => ({
  profitRate: 0.3,
  setProfitRate: (r) => set({ profitRate: r }),
  isDirty: false,
  setIsDirty: (v) => set({ isDirty: v }),
}));
