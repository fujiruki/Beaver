import { render } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VoucherFormValues } from '../../../pages/VoucherEdit';
import { AppSettingsProvider } from '../../../contexts/AppSettingsContext';
import VoucherHeader from '../VoucherHeader';
import LineItemRow from '../LineItemRow';

vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')));

function Harness() {
  const form = useForm<VoucherFormValues>({
    defaultValues: {
      voucher_type: 'estimate',
      tax_input_type: 'exclusive',
      sales_category_id: null,
      lines: [{ item_name: '', location_name: '', memo: '備考', quantity: 1, costs: [], prices: [] }],
    } as VoucherFormValues,
  });
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FormProvider {...form}>
        <AppSettingsProvider>
          <VoucherHeader customers={[]} projects={[]} salesCategories={[]} />
          <LineItemRow index={0} categories={[]} isNew onSaveLine={vi.fn()} />
        </AppSettingsProvider>
      </FormProvider>
    </QueryClientProvider>
  );
}

describe('R-0190 テキスト入力の最大長', () => {
  it.each([
    ['description', 'input[name="description"]'],
    ['item_name', 'textarea[name="lines.0.item_name"]'],
    ['location_name', 'input[name="lines.0.location_name"]'],
    ['memo', 'input[name="lines.0.memo"]'],
  ])('%sは255文字まで入力できる', (_field, selector) => {
    const { container } = render(<Harness />);
    const input = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    expect(input).toBeTruthy();
    expect(input.maxLength).toBe(255);
  });
});
