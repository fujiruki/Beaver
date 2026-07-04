import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewCustomerModal from '../NewCustomerModal';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewCustomerModal isOpen onClose={() => {}} onCreated={() => {}} />
    </QueryClientProvider>,
  );
}

const EXPECTED_FIELD_NAMES = [
  'code', 'name', 'name_kana', 'postal_code', 'address1', 'address2',
  'tel', 'mobile', 'fax', 'email', 'billing_name', 'cutoff_day',
  'billing_offset_days', 'payment_due_days', 'billing_date_print', 'is_active', 'memo',
];

describe('NewCustomerModal 全項目入力 (R-069)', () => {
  it('CustomerDetailと同等の全フィールドが入力できる', () => {
    const { container } = renderModal();

    for (const name of EXPECTED_FIELD_NAMES) {
      const field = container.querySelector(`[name="${name}"]`);
      expect(field, `フィールド ${name} が見つからない`).not.toBeNull();
    }
  });
});
