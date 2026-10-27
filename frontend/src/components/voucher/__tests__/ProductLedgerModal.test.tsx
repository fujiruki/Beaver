import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductLedgerModal from '../ProductLedgerModal';

describe('ProductLedgerModal', () => {
  it('伝票と明細番号、他伝票を変えない案内、保存して反映する操作を表示する', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <ProductLedgerModal
        isOpen
        mode="create"
        voucherLabel="見積 E03988"
        lineNo={5}
        initialName="トイレブース扉"
        categories={[]}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />,
    </QueryClientProvider>);

    expect(screen.getByText('見積 E03988・明細5')).toBeTruthy();
    expect(screen.getByText(/他の伝票は変わりません/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存して明細へ反映' })).toBeTruthy();
    expect((screen.getByLabelText('製品名') as HTMLInputElement).value).toBe('トイレブース扉');
    expect(screen.queryByText('追加工程')).toBeNull();
  });
});
